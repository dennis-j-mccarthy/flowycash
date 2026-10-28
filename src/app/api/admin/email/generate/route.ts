import Anthropic from "@anthropic-ai/sdk";
import { passcodeError, readJson } from "@/lib/adminPasscode";
import { reportAiFailure } from "@/lib/alert";
import { getBlogPost } from "@/lib/blogStore";
import { brandSystemPrompt, loadBrandContext } from "@/lib/brandContext";
import { createEmailDraft } from "@/lib/emailStore";
import {
  fallbackNewsletterCopy,
  renderNewsletter,
  type NewsletterCopy,
  type NewsletterPost,
} from "@/lib/newsletter";
import { findPillar } from "@/lib/pillarStore";
import { isDatabaseConfigured, DB_MISSING_MESSAGE } from "@/lib/prisma";

/*
  POST /api/admin/email/generate — the Newsletter generator (/admin/email).
  Body: { passcode, postIds: string[1..3], pillarId?, topic? }
  Returns: { draft, subjects: string[3], preheader }

  Pulls the chosen published posts, asks the model for the COPY only
  (three subject lines, a preheader, an intro, a blurb per post, an outro)
  in the brand voice (src/lib/brandContext.ts), renders HTML + plain text
  deterministically (src/lib/newsletter.ts) and saves an EmailDraft with
  the first subject. Without ANTHROPIC_API_KEY the deterministic copy is
  used so the maker still produces something to edit.
*/

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-4-8";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subjects: {
      type: "array",
      items: { type: "string" },
      description: "Exactly three distinct subject lines, each under 60 characters, no emoji, no clickbait.",
    },
    preheader: {
      type: "string",
      description: "One sentence (under 110 characters) that extends the first subject line in the inbox preview.",
    },
    intro: {
      type: "string",
      description: "A 1–3 sentence opening paragraph, owner-to-owner, that frames why these posts matter this week.",
    },
    blurbs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          postId: { type: "string" },
          heading: { type: "string", description: "A heading for this section — the post title or a sharper rewording of it." },
          blurb: { type: "string", description: "2–4 sentences on what the reader gets from the post. Stay inside what the post says. No URL — the button carries it." },
        },
        required: ["postId", "heading", "blurb"],
      },
    },
    outro: {
      type: "string",
      description: "A one- or two-sentence sign-off with a soft next step (reply, book a call, visit /contact).",
    },
  },
  required: ["subjects", "preheader", "intro", "blurbs", "outro"],
};

export async function POST(req: Request) {
  const body = await readJson<{
    passcode?: string;
    postIds?: unknown;
    pillarId?: string;
    topic?: string;
  }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });
  }

  const ids = (Array.isArray(body.postIds) ? body.postIds : [])
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, 3);
  if (!ids.length) return Response.json({ error: "Pick 1–3 published posts." }, { status: 400 });
  const pillar = typeof body.pillarId === "string" ? await findPillar(body.pillarId) : null;
  const topic = String(body.topic ?? "").trim().slice(0, 300);

  // The posts, in the order picked. Only published ones make a newsletter.
  const posts: (NewsletterPost & { body: string })[] = [];
  for (const id of ids) {
    const rec = await getBlogPost(id).catch(() => null);
    if (!rec || rec.status !== "published") {
      return Response.json({ error: `Post ${id} isn't published (or doesn't exist).` }, { status: 400 });
    }
    posts.push({
      id: rec.id,
      slug: rec.slug,
      title: rec.title,
      excerpt: rec.excerpt,
      heroImage: rec.heroImage,
      body: rec.body,
    });
  }

  let copy: NewsletterCopy = fallbackNewsletterCopy(posts, topic || undefined);
  let subjects: string[] = [posts[0].title];
  let preheader = posts[0].excerpt.slice(0, 110);

  if (process.env.ANTHROPIC_API_KEY) {
    const ctx = await loadBrandContext({ pillarId: pillar?.id });
    const client = new Anthropic();
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: SCHEMA },
        },
        system: brandSystemPrompt(ctx, {
          role: "You write the email newsletter. It rounds up one to three recent blog posts for subscribers who use FlowyCash to keep their cashflow on a calendar. Short, warm, specific; it should read like a note from the founder, not a marketing blast.",
          includePillars: true,
          extra: "FORMAT: return the copy only — the layout, images, buttons and links are added by the template. Use the exact postId values given for the blurbs, one blurb per post, in the order given.",
        }),
        messages: [
          {
            role: "user",
            content: `Write the newsletter copy for these posts.${topic ? `\n\nTHEME / TOPIC FOR THIS ISSUE: ${topic}` : ""}

${posts
  .map(
    (p, i) => `POST ${i + 1} — postId: ${p.id}
TITLE: ${p.title}
EXCERPT: ${p.excerpt || "(none)"}
BODY (Markdown, trimmed):
${p.body.slice(0, 3500)}`,
  )
  .join("\n\n---\n\n")}`,
          },
        ],
      });
      if (res.stop_reason === "max_tokens") throw new Error("Newsletter generation ran out of room.");
      const block = res.content.find((b) => b.type === "text");
      const data = JSON.parse(block && "text" in block ? block.text : "{}") as Partial<
        NewsletterCopy & { subjects: unknown; preheader: unknown }
      >;
      const subs = (Array.isArray(data.subjects) ? data.subjects : [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 3);
      if (subs.length) subjects = subs;
      if (typeof data.preheader === "string" && data.preheader.trim()) preheader = data.preheader.trim().slice(0, 160);
      const blurbs = (Array.isArray(data.blurbs) ? data.blurbs : [])
        .map((b) => ({
          postId: String(b?.postId ?? ""),
          heading: String(b?.heading ?? "").trim(),
          blurb: String(b?.blurb ?? "").trim(),
        }))
        .filter((b) => posts.some((p) => p.id === b.postId));
      copy = {
        intro: String(data.intro ?? copy.intro).trim(),
        blurbs: blurbs.length ? blurbs : copy.blurbs,
        outro: String(data.outro ?? copy.outro).trim(),
      };
    } catch (err) {
      await reportAiFailure("Newsletter generator", err);
      console.error("[email/generate] model failed, using fallback copy:", err);
    }
  }

  const subject = subjects[0];
  const rendered = renderNewsletter(posts, copy, { subject, preheader });
  try {
    const draft = await createEmailDraft({
      name: subject,
      subject,
      preheader,
      html: rendered.html,
      text: rendered.text,
      pillarId: pillar?.id ?? null,
      postIds: posts.map((p) => p.id),
    });
    return Response.json({ draft, subjects, preheader, copy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
