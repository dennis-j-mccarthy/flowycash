import { cleanTone, tonePrompt, type BlogTone } from "@/lib/blogTone";
import { getBrandEssence, type BrandEssenceRecord, type VoiceSliders } from "@/lib/essenceStore";
import { pillarIn, pillarPrompt, type Pillar } from "@/lib/pillars";
import { loadPillars } from "@/lib/pillarStore";
import { site } from "@/lib/site";

/*
  ONE brand context for every generator (captions, titles, write, the
  social-draft writer, the newsletter). SERVER ONLY.

    const ctx = await loadBrandContext({ pillarId, toneFallback });
    system: brandSystemPrompt(ctx, { role: "…", extra: "…" })

  Reads the BrandEssence singleton (essence + voice sliders + tone brief)
  and the Pillar rows (src/lib/pillarStore.ts — active, in order); falls
  back to the code defaults in src/lib/pillars.ts when there is no
  database. `toneFallback` is the browser's copy of the tone (legacy
  no-DB path) and is only used when nothing is saved server-side.
*/

export interface BrandContext {
  essence: BrandEssenceRecord;
  voice: VoiceSliders;
  tone: BlogTone | null;
  /** The chosen pillar, or null (unknown ids resolve to null, never throw). */
  pillar: Pillar | null;
  /** Every active pillar, in display order. */
  pillars: Pillar[];
}

export async function loadBrandContext(
  opts: { pillarId?: string | null; toneFallback?: unknown } = {},
): Promise<BrandContext> {
  const [essence, pillars] = await Promise.all([getBrandEssence(), loadPillars()]);
  let tone = essence.tone;
  if (!tone && opts.toneFallback && typeof opts.toneFallback === "object") {
    const t = cleanTone(opts.toneFallback);
    if (t.voice || t.audience || t.style || t.dos || t.donts) tone = t;
  }
  return { essence, voice: essence.voice, tone, pillar: pillarIn(pillars, opts.pillarId), pillars };
}

function lean(v: number, low: string, high: string): string {
  const d = v - 50;
  if (Math.abs(d) < 8) return `balanced between ${low} and ${high}`;
  const strength = Math.abs(d) >= 35 ? "strongly" : Math.abs(d) >= 18 ? "clearly" : "slightly";
  return `${strength} ${d > 0 ? high : low} (${v}/100)`;
}

/** The three sliders as prose the model can act on. */
export function voicePrompt(v: VoiceSliders): string {
  return [
    `- Playful ↔ Serious: ${lean(v.playful, "serious", "playful")}`,
    `- Formal ↔ Casual: ${lean(v.formal, "casual", "formal")}`,
    `- Bold ↔ Gentle: ${lean(v.bold, "gentle", "bold")}`,
  ].join("\n");
}

export function essenceBlock(e: BrandEssenceRecord): string {
  return [
    `BRAND LINE: ${e.line}`,
    `PURPOSE: ${e.purpose}`,
    `PROMISE: ${e.promise}`,
    `DO: ${e.doList.join("; ")}`,
    `DON'T: ${e.dontList.join("; ")}`,
  ].join("\n");
}

/**
 * The shared system prompt. `role` is the one-paragraph job description for
 * this generator; `extra` is appended last (platform brief, format notes…).
 * `includePillars` lists every active pillar when no single one is chosen.
 */
export function brandSystemPrompt(
  ctx: BrandContext,
  opts: { role: string; extra?: string; includePillars?: boolean },
): string {
  const parts: string[] = [
    `${opts.role} The brand is "${site.name}" (${site.url}), a personal cashflow calendar app: every dollar in and out on a calendar, with the running balance day by day, so people catch negative days before they happen. Free to start; Pro is $9/month. Plain, calm, specific; no hype words (revolutionary, game-changing, unlock, elevate), no get-rich framing, and never financial advice or promised returns. Never invent facts, numbers, quotes, users or claims.`,
    `BRAND ESSENCE:\n${essenceBlock(ctx.essence)}`,
    `VOICE DIALS:\n${voicePrompt(ctx.voice)}`,
    `TONE BRIEF:\n${tonePrompt(ctx.tone ?? { voice: "", audience: "", style: "", dos: "", donts: "" })}`,
  ];
  if (ctx.pillar) {
    parts.push(
      `CONTENT PILLAR — carry this message (naturally, never as a slogan):\n${pillarPrompt(ctx.pillar)}`,
    );
  } else if (opts.includePillars && ctx.pillars.length) {
    parts.push(
      `CONTENT PILLARS (draw on any; each piece should land one):\n${ctx.pillars.map((p) => `- ${p.name}: ${p.message}`).join("\n")}`,
    );
  }
  if (opts.extra) parts.push(opts.extra);
  return parts.join("\n\n");
}
