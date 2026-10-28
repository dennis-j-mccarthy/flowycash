import Anthropic from "@anthropic-ai/sdk";
import { passcodeError } from "@/lib/adminPasscode";
import { getBlogPost } from "@/lib/blogStore";
import { isDatabaseConfigured } from "@/lib/prisma";

/*
  GET /api/admin/images/suggest?postId=   (header x-admin-passcode)
  GET /api/admin/images/suggest?title=&excerpt=

  → { queries: string[], ai: boolean }

  Three short stock-photo search queries for a post. With ANTHROPIC_API_KEY
  the model turns the title + excerpt into concrete, photographable subjects
  ("woman reviewing invoice at kitchen table"); without it — or if the model
  call fails — the title's keywords are used (ai: false). postId reads the
  BlogPost from the database; title/excerpt work without one (the generator
  has them client-side).
*/

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-opus-4-8";
const COUNT = 3;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    queries: {
      type: "array",
      items: { type: "string" },
      description: "Stock-photo search queries, 2–5 words each, concrete and visual.",
    },
  },
  required: ["queries"],
};

const STOPWORDS = new Set(
  (
    "a an the and or but of to in on for with by from at as is are was were be been being it its this that these those " +
    "you your yours we our ours they their them i me my he she his her him who whom whose what which when where why how " +
    "do does did done doing have has had having can could should would will shall may might must not no yes if then than " +
    "so too very just about into over under again further once here there all any both each few more most other some such " +
    "only own same up down out off why vs versus get got make makes made need needs really still actually without within"
  ).split(/\s+/),
);

function keywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    const w = raw.replace(/^'+|'+$/g, "");
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

/** No-AI fallback: a few keyword combinations from the title (then excerpt). */
function keywordQueries(title: string, excerpt: string): string[] {
  const t = keywords(title);
  const e = keywords(excerpt).filter((w) => !t.includes(w));
  const candidates = [
    t.slice(0, 3).join(" "),
    t.slice(0, 2).join(" "),
    [t[0], e[0]].filter(Boolean).join(" "),
    t.slice(1, 4).join(" "),
    e.slice(0, 2).join(" "),
  ];
  const out: string[] = [];
  for (const c of candidates) {
    const q = c.trim();
    if (q && !out.includes(q)) out.push(q);
    if (out.length === COUNT) break;
  }
  if (!out.length) out.push("person planning their month on a calendar");
  return out;
}

async function aiQueries(title: string, excerpt: string): Promise<string[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
    system: `You write stock-photo search queries for a small-business blog's hero image. Each query is 2–5 words naming something a photographer could actually shoot: a person doing a thing, a place, an object. Concrete and literal beats clever. No abstract nouns (success, growth, innovation), no brand names, no text or logos, no AI/robot clichés unless the post is literally about robots. Vary the three: one of a person at work, one of a place or object, one wider or more atmospheric.`,
    messages: [
      {
        role: "user",
        content: `Post title: ${title}\n${excerpt ? `Excerpt: ${excerpt}\n` : ""}\nReturn exactly ${COUNT} queries in the queries array.`,
      },
    ],
  });
  if (res.stop_reason === "max_tokens") return null;
  const block = res.content.find((b) => b.type === "text");
  const data = JSON.parse(block && "text" in block ? block.text : "{}");
  const queries = (Array.isArray(data.queries) ? data.queries : [])
    .map((q: unknown) => String(q).trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .slice(0, COUNT);
  return queries.length ? queries : null;
}

export async function GET(req: Request) {
  const denied = passcodeError(req);
  if (denied) return denied;

  const sp = new URL(req.url).searchParams;
  let title = (sp.get("title") || "").trim().slice(0, 300);
  let excerpt = (sp.get("excerpt") || "").trim().slice(0, 600);

  const postId = (sp.get("postId") || "").trim();
  if (postId && isDatabaseConfigured()) {
    try {
      const post = await getBlogPost(postId);
      if (post) {
        title = post.title;
        excerpt = post.excerpt;
      }
    } catch (err) {
      console.error("[images/suggest] post lookup failed:", err);
    }
  }

  if (!title) {
    return Response.json({ error: "Give me a postId or a title to work from." }, { status: 400 });
  }

  try {
    const queries = await aiQueries(title, excerpt);
    if (queries) return Response.json({ queries, ai: true });
  } catch (err) {
    // Suggestions are a convenience — fall through to keywords, don't fail.
    console.error("[images/suggest] model call failed:", err instanceof Error ? err.message : err);
  }
  return Response.json({ queries: keywordQueries(title, excerpt), ai: false });
}
