import Anthropic from "@anthropic-ai/sdk";
import { reportAiFailure } from "@/lib/alert";
import { getBlogPost } from "@/lib/blogStore";
import { brandSystemPrompt, loadBrandContext } from "@/lib/brandContext";
import { isDatabaseConfigured } from "@/lib/prisma";
import { blogPostUrl, clamp } from "@/lib/socialDrafts";
import { CAPTION_LIMITS, PLATFORM_LABELS, isSocialPlatform, type SocialPlatform } from "@/lib/socialPlatforms";

/*
  POST /api/admin/social/captions — step 4 of the post maker (/admin/social).
  Body: { passcode, pillarId, platform, imageAlt?, blogPostId?, topic?, tone? }
  Returns: { captions: string[3], pillarId, platform }

  Three caption options for ONE platform, in the brand voice: the Essence
  (line / purpose / promise / do / don't), voice dials and tone brief from
  src/lib/brandContext.ts (`tone` in the body is only a no-database
  fallback), plus the chosen pillar's message + angles (src/lib/pillars.ts).
  `imageAlt` describes the picked image so the copy can refer to it;
  `blogPostId` pulls that post's title/excerpt/link so the caption promotes
  it; `topic` is a free-text nudge. Each option is clamped to the platform's
  character budget (socialPlatforms.ts). Guarded by ADMIN_PASSCODE.
*/

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-4-8";
const COUNT = 3;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    captions: {
      type: "array",
      items: { type: "string" },
      description: "Exactly three distinct, ready-to-post captions for the named platform.",
    },
  },
  required: ["captions"],
};

const PLATFORM_BRIEF: Record<SocialPlatform, string> = {
  facebook:
    "Facebook Page post: 2–4 short paragraphs, conversational, one concrete point. A link (if given) on its own last line. No hashtag walls — at most 2. Under 1200 characters.",
  instagram:
    "Instagram caption: a strong first line (it shows before 'more'), then 2–3 short paragraphs, then 5–8 relevant hashtags on the last line. Never include a URL — say 'link in bio' if there is a post. Under 1500 characters.",
  linkedin:
    "LinkedIn post: a one-line hook, a blank line, then 3–5 short paragraphs with one concrete takeaway, owner-to-owner. Link (if given) at the end. At most 3 hashtags. Under 1800 characters.",
  x: "X (Twitter) post: ONE punchy sentence or two, at most 230 characters NOT counting a link. If a link is given, end with a space and the link. Total must fit in 280 characters.",
};

export async function POST(req: Request) {
  let body: {
    passcode?: string;
    pillarId?: string;
    platform?: string;
    imageAlt?: string;
    blogPostId?: string;
    topic?: string;
    tone?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) {
    return Response.json(
      { error: "Server missing ADMIN_PASSCODE — the post maker is disabled." },
      { status: 500 },
    );
  }
  if ((body.passcode || "") !== expected) {
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Server missing ANTHROPIC_API_KEY" }, { status: 500 });
  }

  const ctx = await loadBrandContext({
    pillarId: typeof body.pillarId === "string" ? body.pillarId : null,
    toneFallback: body.tone,
  });
  const pillar = ctx.pillar;
  if (!pillar) {
    return Response.json({ error: "Choose a pillar first (step 3)." }, { status: 400 });
  }
  const platform: SocialPlatform = isSocialPlatform(body.platform) ? body.platform : "facebook";
  const imageAlt = String(body.imageAlt ?? "").trim().slice(0, 300);
  const topic = String(body.topic ?? "").trim().slice(0, 600);

  // Optional blog post to promote.
  let post: { title: string; excerpt: string; link: string } | null = null;
  const blogPostId = String(body.blogPostId ?? "").trim();
  if (blogPostId && isDatabaseConfigured()) {
    try {
      const rec = await getBlogPost(blogPostId);
      if (rec) post = { title: rec.title, excerpt: rec.excerpt, link: blogPostUrl(rec.slug) };
    } catch (err) {
      console.error("[social/captions] post lookup failed:", err);
    }
  }

  const client = new Anthropic();
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: brandSystemPrompt(ctx, {
        role: "You write social posts. Write for ONE platform at a time, in its native shape. Each of the three options must take a different angle — not three rewordings of one idea.",
        extra: `PLATFORM:\n${PLATFORM_BRIEF[platform]}`,
      }),
      messages: [
        {
          role: "user",
          content: `Write exactly ${COUNT} ${PLATFORM_LABELS[platform]} caption options for the "${pillar.name}" pillar.
${imageAlt ? `\nTHE IMAGE SHOWS: ${imageAlt}` : "\nTHE IMAGE: not described — don't describe it, just don't contradict a generic business/workspace photo."}${
            post
              ? `\n\nPROMOTE THIS BLOG POST:\nTITLE: ${post.title}\nEXCERPT: ${post.excerpt || "(none)"}\nLINK: ${post.link}`
              : ""
          }${topic ? `\n\nWHAT THIS POST IS ABOUT: ${topic}` : ""}

Return them in the captions array.`,
        },
      ],
    });

    if (res.stop_reason === "max_tokens") {
      return Response.json({ error: "The model ran out of room — try again." }, { status: 502 });
    }

    const block = res.content.find((b) => b.type === "text");
    const data = JSON.parse(block && "text" in block ? block.text : "{}");
    const limit = CAPTION_LIMITS[platform];
    const captions: string[] = (Array.isArray(data.captions) ? data.captions : [])
      .map((c: unknown) => String(c).trim())
      .filter(Boolean)
      .slice(0, COUNT)
      .map((c: string) => {
        if (platform !== "x" || !post) return clamp(c, limit);
        // X: guarantee the link survives the clamp.
        const withoutLink = c.replace(post.link, "").trim();
        return `${clamp(withoutLink, limit - 25)} ${post.link}`;
      });
    if (!captions.length) {
      return Response.json({ error: "No captions came back — try again." }, { status: 502 });
    }
    return Response.json({ captions, pillarId: pillar.id, platform });
  } catch (err) {
    await reportAiFailure("Post maker captions", err);
    const msg = err instanceof Error ? err.message : "generation failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
