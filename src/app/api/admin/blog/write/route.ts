import Anthropic from "@anthropic-ai/sdk";
import { reportAiFailure } from "@/lib/alert";
import { createBlogPost, slugify } from "@/lib/blogStore";
import { brandSystemPrompt, loadBrandContext } from "@/lib/brandContext";
import { isDatabaseConfigured } from "@/lib/prisma";

/*
  POST /api/admin/blog/write — step 3 of the blog generator.
  Body: { passcode, title, pillarId?, tone? }
        Voice comes from src/lib/brandContext.ts (Essence + dials + tone
        brief); `tone` in the body is only the no-database fallback.
        pillarId (src/lib/pillars.ts) steers the argument and is recorded on
        the saved BlogPost so its social drafts inherit it.
  Returns: { draft: { title, excerpt, body, slug, markdown, id?, saved, saveError? } }

  `body` is the post as Markdown (## subheads + paragraphs); `markdown` is the
  same body with gray-matter frontmatter prepended, ready to paste into a new
  content/blog/<slug>.md file (matching src/lib/posts.ts).

  With DIRECT_DATABASE_URL set the draft is also saved as a BlogPost (status
  "draft", source "generated") and its `id` comes back so /admin/blog/posts
  can open it for editing + publishing. Without a database nothing is written
  server-side and the Markdown route still works. Guarded by ADMIN_PASSCODE.
*/

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-4-8";
const AUTHOR = "Dennis McCarthy";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    excerpt: {
      type: "string",
      description:
        "A 1-2 sentence summary for the post card and meta description. Plain-spoken, no clickbait.",
    },
    body: {
      type: "string",
      description:
        "The full post as GitHub-flavoured Markdown: several paragraphs with a few `## ` subheadings. Do NOT repeat the title as an H1 at the top. End with a short call to action linking to /contact, e.g. [Let's talk.](/contact).",
    },
  },
  required: ["excerpt", "body"],
};

export async function POST(req: Request) {
  let body: { passcode?: string; tone?: unknown; title?: string; pillarId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) {
    return Response.json(
      { error: "Server missing ADMIN_PASSCODE — the generator is disabled." },
      { status: 500 },
    );
  }
  if ((body.passcode || "") !== expected) {
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Server missing ANTHROPIC_API_KEY" }, { status: 500 });
  }

  const title = String(body.title ?? "").trim();
  if (!title) {
    return Response.json({ error: "Pick a title to write from." }, { status: 400 });
  }
  const ctx = await loadBrandContext({
    pillarId: typeof body.pillarId === "string" ? body.pillarId : null,
    toneFallback: body.tone,
  });
  const pillar = ctx.pillar;

  const client = new Anthropic();
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: brandSystemPrompt(ctx, {
        role: "You are the blog writer. Write a complete, publishable blog post that follows the tone brief exactly. Make ONE clear argument and land it. Use Markdown: paragraphs plus a few `## ` subheadings. Never restate the title as a heading at the top.",
        includePillars: true,
      }),
      messages: [
        {
          role: "user",
          content: `Write the full blog post for this title (use it as-is; do not change it):

"${title}"

Return the excerpt and the Markdown body.`,
        },
      ],
    });

    if (res.stop_reason === "max_tokens") {
      return Response.json(
        { error: "The post was too long to finish — try again or tighten the tone's length note." },
        { status: 502 },
      );
    }

    const block = res.content.find((b) => b.type === "text");
    const data = JSON.parse(block && "text" in block ? block.text : "{}");
    const excerpt = String(data.excerpt ?? "").trim();
    const postBody = String(data.body ?? "").trim();
    if (!postBody) {
      return Response.json({ error: "No post came back — try again." }, { status: 502 });
    }

    const slug = slugify(title);
    const date = new Date().toISOString().slice(0, 10);
    // gray-matter frontmatter matching content/blog/*.md (title, date, excerpt,
    // author, image). image is left as a placeholder comment to fill in.
    const markdown = `---
title: ${JSON.stringify(title)}
date: ${JSON.stringify(date)}
excerpt: ${JSON.stringify(excerpt)}
author: ${JSON.stringify(AUTHOR)}
# image: "/assets/article-stock/your-image.jpg"
---

${postBody}
`;

    // Persist as a draft when the database is wired; the slug may be
    // de-duplicated (title-2, …) so report the stored one.
    let id: string | undefined;
    let storedSlug = slug;
    let saveError: string | undefined;
    if (isDatabaseConfigured()) {
      try {
        const rec = await createBlogPost({
          title,
          excerpt,
          body: postBody,
          slug,
          source: "generated",
          pillarId: pillar?.id ?? null,
        });
        id = rec.id;
        storedSlug = rec.slug;
      } catch (e) {
        saveError = e instanceof Error ? e.message : "Couldn't save the draft.";
        console.error("[blog/write] draft save failed:", e);
      }
    }

    return Response.json({
      draft: {
        title,
        excerpt,
        body: postBody,
        slug: storedSlug,
        markdown,
        id,
        saved: !!id,
        saveError,
        pillarId: pillar?.id ?? null,
      },
    });
  } catch (err) {
    await reportAiFailure("Admin blog writer", err);
    const msg = err instanceof Error ? err.message : "generation failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
