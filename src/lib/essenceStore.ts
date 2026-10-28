import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { cleanTone, type BlogTone } from "@/lib/blogTone";
import { BRAND_ESSENCE } from "@/lib/pillars";

/*
  BrandEssence singleton (id "default") — the Throughline "Essence" page.

    getBrandEssence()   the row, or the code defaults when there's no DB /
                        no row yet. If the row is missing but the legacy
                        BlogSettings tone exists, that tone is folded in so
                        nothing is lost between deploys.
    saveBrandEssence()  upsert; also the only writer of the tone brief now
                        (/api/admin/blog/tone goes through saveTone below).

  Pure data in, pure data out — every generator reads this through
  src/lib/brandContext.ts, never directly.
*/

export interface VoiceSliders {
  /** 0 = serious … 100 = playful */
  playful: number;
  /** 0 = casual … 100 = formal */
  formal: number;
  /** 0 = gentle … 100 = bold */
  bold: number;
}

export interface BrandEssenceRecord {
  line: string;
  purpose: string;
  promise: string;
  doList: string[];
  dontList: string[];
  voice: VoiceSliders;
  /** null = no tone brief saved (prompts use the house default) */
  tone: BlogTone | null;
  updatedAt: string | null;
  /** true when this came from the database (vs. code defaults) */
  fromDb: boolean;
}

const ID = "default";
const CAP = 600;
const LIST_CAP = 12;

export const DEFAULT_VOICE: VoiceSliders = { playful: 50, formal: 50, bold: 50 };

export function defaultEssence(): BrandEssenceRecord {
  return {
    line: BRAND_ESSENCE.line,
    purpose: BRAND_ESSENCE.purpose,
    promise: BRAND_ESSENCE.promise,
    doList: [...BRAND_ESSENCE.doList],
    dontList: [...BRAND_ESSENCE.dontList],
    voice: { ...DEFAULT_VOICE },
    tone: null,
    updatedAt: null,
    fromDb: false,
  };
}

function pct(v: unknown, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function str(v: unknown, cap = CAP): string {
  return String(v ?? "").trim().slice(0, cap);
}

function list(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x, 160)).filter(Boolean).slice(0, LIST_CAP);
}

/** Normalise an essence payload off the wire (partial allowed). */
export function cleanEssenceInput(input: unknown): Partial<BrandEssenceRecord> {
  const e = (input ?? {}) as Record<string, unknown>;
  const out: Partial<BrandEssenceRecord> = {};
  if ("line" in e) out.line = str(e.line, 200);
  if ("purpose" in e) out.purpose = str(e.purpose);
  if ("promise" in e) out.promise = str(e.promise);
  if ("doList" in e) out.doList = list(e.doList);
  if ("dontList" in e) out.dontList = list(e.dontList);
  if ("voice" in e && e.voice && typeof e.voice === "object") {
    const v = e.voice as Record<string, unknown>;
    out.voice = {
      playful: pct(v.playful, DEFAULT_VOICE.playful),
      formal: pct(v.formal, DEFAULT_VOICE.formal),
      bold: pct(v.bold, DEFAULT_VOICE.bold),
    };
  }
  if ("tone" in e) out.tone = e.tone ? cleanTone(e.tone) : null;
  return out;
}

export async function getBrandEssence(): Promise<BrandEssenceRecord> {
  const base = defaultEssence();
  if (!isDatabaseConfigured()) return base;
  try {
    const row = await prisma.brandEssence.findUnique({ where: { id: ID } });
    if (!row) {
      // Pre-migration-seed safety net: keep a tone saved under BlogSettings.
      const legacy = await prisma.blogSettings.findUnique({ where: { id: ID } }).catch(() => null);
      return legacy ? { ...base, tone: cleanTone(legacy.tone) } : base;
    }
    return {
      line: row.line || base.line,
      purpose: row.purpose || base.purpose,
      promise: row.promise || base.promise,
      doList: row.doList.length ? row.doList : base.doList,
      dontList: row.dontList.length ? row.dontList : base.dontList,
      voice: { playful: row.voicePlayful, formal: row.voiceFormal, bold: row.voiceBold },
      tone: row.tone ? cleanTone(row.tone) : null,
      updatedAt: row.updatedAt.toISOString(),
      fromDb: true,
    };
  } catch (err) {
    console.error("[essence] read failed, using defaults:", err);
    return base;
  }
}

/** Upsert the singleton. Fields left undefined keep their stored value. */
export async function saveBrandEssence(
  patch: Partial<BrandEssenceRecord>,
): Promise<BrandEssenceRecord> {
  const current = await getBrandEssence();
  const next: BrandEssenceRecord = {
    ...current,
    ...patch,
    voice: { ...current.voice, ...(patch.voice ?? {}) },
  };
  // A nullable Json column is cleared with Prisma.DbNull, never JS null.
  const tone: Prisma.InputJsonValue | typeof Prisma.DbNull = next.tone
    ? (next.tone as unknown as Prisma.InputJsonValue)
    : Prisma.DbNull;
  const data = {
    line: next.line,
    purpose: next.purpose,
    promise: next.promise,
    doList: next.doList,
    dontList: next.dontList,
    voicePlayful: next.voice.playful,
    voiceFormal: next.voice.formal,
    voiceBold: next.voice.bold,
    tone,
  };
  await prisma.brandEssence.upsert({
    where: { id: ID },
    create: { id: ID, ...data },
    update: data,
  });
  return getBrandEssence();
}

/* ───────── tone brief (what /api/admin/blog/tone reads and writes) ───────── */

/** The saved tone, or null when none is stored (or there's no DB). */
export async function getSavedTone(): Promise<BlogTone | null> {
  if (!isDatabaseConfigured()) return null;
  return (await getBrandEssence()).tone;
}

export async function saveTone(tone: BlogTone): Promise<BlogTone> {
  const clean = cleanTone(tone);
  await saveBrandEssence({ tone: clean });
  return clean;
}
