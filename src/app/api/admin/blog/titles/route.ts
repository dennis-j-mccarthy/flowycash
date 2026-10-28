import Anthropic from "@anthropic-ai/sdk";
import { reportAiFailure } from "@/lib/alert";
import { brandSystemPrompt, loadBrandContext } from "@/lib/brandContext";

/*
  POST /api/admin/blog/titles — the title generator on /admin/blog.
  Body: { passcode, topic?, count, pillarId?, tone? }
  Returns: { titles: string[], pillarId: string | null }
           — N headline ideas in the brand voice (src/lib/brandContext.ts:
           Essence + voice dials + tone brief; `tone` in the body is only
           the no-database fallback).

  `pillarId` (src/lib/pillars.ts) biases every title toward that pillar's
  brand message and angle prompts; without it the titles may draw on any
  pillar. Guarded by ADMIN_PASSCODE (env). Titles only; the full post is a
  separate call (/api/admin/blog/write) once the operator picks one.
*/

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-4-8";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    titles: {
      type: "array",
      items: { type: "string" },
      description:
        "Blog post title ideas — each a complete, specific, publishable headline (not a topic label).",
    },
  },
  required: ["titles"],
};

export async function POST(req: Request) {
  let body: { passcode?: string; tone?: unknown; topic?: string; count?: number; pillarId?: string };
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

  const topic = String(body.topic ?? "").trim().slice(0, 600);
  // Clamp the count; the model is told N and we slice to be sure.
  const count = Math.min(12, Math.max(1, Math.round(Number(body.count) || 6)));
  const ctx = await loadBrandContext({
    pillarId: typeof body.pillarId === "string" ? body.pillarId : null,
    toneFallback: body.tone,
  });
  const pillar = ctx.pillar;

  const client = new Anthropic();
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: brandSystemPrompt(ctx, {
        role: "You generate blog post title ideas. Each title must be a complete, specific headline someone would actually click — not a vague topic. No numbering, no quotes around them. When a pillar is given, spread the titles across its angles; do not restate the message word for word.",
        includePillars: true,
      }),
      messages: [
        {
          role: "user",
          content: `Give me exactly ${count} blog post title ideas${
            topic ? ` about: "${topic}"` : ""
          }${pillar ? ` for the "${pillar.name}" pillar` : ""}. Return them in the titles array.`,
        },
      ],
    });

    if (res.stop_reason === "max_tokens") {
      return Response.json(
        { error: "The model ran out of room — try a smaller count." },
        { status: 502 },
      );
    }

    const block = res.content.find((b) => b.type === "text");
    const data = JSON.parse(block && "text" in block ? block.text : "{}");
    const titles = (Array.isArray(data.titles) ? data.titles : [])
      .map((t: unknown) => String(t).trim())
      .filter(Boolean)
      .slice(0, count);
    if (!titles.length) {
      return Response.json({ error: "No titles came back — try again." }, { status: 502 });
    }
    return Response.json({ titles, pillarId: pillar?.id ?? null });
  } catch (err) {
    await reportAiFailure("Admin blog titles", err);
    const msg = err instanceof Error ? err.message : "generation failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
