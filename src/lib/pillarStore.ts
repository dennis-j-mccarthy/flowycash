import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import {
  DEFAULT_PILLARS,
  cleanPillarId,
  isValidPillarId,
  pillarIn,
  slugifyPillarId,
  type Pillar,
} from "@/lib/pillars";

/*
  Pillar rows — SERVER ONLY (imports Prisma). The loader every generator
  reads through, and the CRUD behind /api/admin/pillars.

    loadPillars()            active pillars by sortOrder; DEFAULT_PILLARS when
                             there is no database (or the read fails)
    loadAllPillars()         same, inactive included (the editor)
    findPillar(id)           one pillar or null (unknown / legacy ids → null)
    resolvePillarId(v)       a stored-safe id or null — what routes write
    createPillar / updatePillar / deletePillar (with reassign)

  Without a database the editor is read-only and the defaults apply.
*/

const NAME_CAP = 60;
const MESSAGE_CAP = 300;
const LIST_CAP = 12;
const ITEM_CAP = 200;

type Row = {
  id: string;
  name: string;
  message: string;
  angles: string[];
  hashtags: string[];
  target: number | null;
  sortOrder: number;
  active: boolean;
};

function toPillar(r: Row): Pillar {
  return {
    id: r.id,
    name: r.name,
    message: r.message,
    angles: r.angles,
    hashtags: r.hashtags,
    target: r.target,
    sortOrder: r.sortOrder,
    active: r.active,
  };
}

export async function loadAllPillars(): Promise<Pillar[]> {
  if (!isDatabaseConfigured()) return DEFAULT_PILLARS;
  try {
    const rows = await prisma.pillar.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return rows.map(toPillar);
  } catch (err) {
    console.error("[pillars] read failed, using defaults:", err);
    return DEFAULT_PILLARS;
  }
}

/** Active pillars in display order — what pickers and prompts use. */
export async function loadPillars(): Promise<Pillar[]> {
  return (await loadAllPillars()).filter((p) => p.active);
}

export async function findPillar(id: string | null | undefined): Promise<Pillar | null> {
  if (!id) return null;
  return pillarIn(await loadAllPillars(), id);
}

/** The id when it names a known pillar, else null (never rejects — drops). */
export async function resolvePillarId(v: unknown): Promise<string | null> {
  const id = cleanPillarId(v);
  if (!id) return null;
  return (await findPillar(id)) ? id : null;
}

/* ───────── input cleaning ───────── */

function str(v: unknown, cap: number): string {
  return String(v ?? "").trim().slice(0, cap);
}

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x, ITEM_CAP)).filter(Boolean).slice(0, LIST_CAP);
  if (typeof v === "string") {
    return v
      .split(/\r?\n|,/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, LIST_CAP);
  }
  return [];
}

function pct(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

export interface PillarInput {
  id?: string;
  name?: string;
  message?: string;
  angles?: string[];
  hashtags?: string[];
  target?: number | null;
  sortOrder?: number;
  active?: boolean;
}

/** Normalise a pillar payload (partial allowed). Unknown keys are ignored. */
export function cleanPillarInput(input: unknown): PillarInput {
  const e = (input ?? {}) as Record<string, unknown>;
  const out: PillarInput = {};
  if ("id" in e && typeof e.id === "string") out.id = slugifyPillarId(e.id);
  if ("name" in e) out.name = str(e.name, NAME_CAP);
  if ("message" in e) out.message = str(e.message, MESSAGE_CAP);
  if ("angles" in e) out.angles = list(e.angles);
  if ("hashtags" in e) {
    out.hashtags = list(e.hashtags).map((h) => (h.startsWith("#") ? h : `#${h.replace(/\s+/g, "")}`));
  }
  if ("target" in e) out.target = pct(e.target);
  if ("sortOrder" in e && Number.isFinite(Number(e.sortOrder))) out.sortOrder = Math.round(Number(e.sortOrder));
  if ("active" in e) out.active = !!e.active;
  return out;
}

/* ───────── writes ───────── */

export class PillarError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PillarError";
    this.status = status;
  }
}

export async function createPillar(input: PillarInput): Promise<Pillar> {
  const name = input.name ?? "";
  if (!name) throw new PillarError("Give the pillar a name.");
  let id = input.id || slugifyPillarId(name);
  if (!isValidPillarId(id)) id = `pillar-${Date.now().toString(36)}`;
  const taken = await prisma.pillar.findUnique({ where: { id }, select: { id: true } });
  if (taken) throw new PillarError(`A pillar with the id "${id}" already exists.`, 409);
  const last = await prisma.pillar.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.pillar.create({
    data: {
      id,
      name,
      message: input.message ?? "",
      angles: input.angles ?? [],
      hashtags: input.hashtags ?? [],
      target: input.target ?? null,
      sortOrder: input.sortOrder ?? (last._max.sortOrder ?? -1) + 1,
      active: input.active ?? true,
    },
  });
  return toPillar(row);
}

/** Fields left undefined keep their stored value. Returns null when missing. */
export async function updatePillar(id: string, input: PillarInput): Promise<Pillar | null> {
  const existing = await prisma.pillar.findUnique({ where: { id } });
  if (!existing) return null;
  if (input.name !== undefined && !input.name) throw new PillarError("The name can't be empty.");
  const row = await prisma.pillar.update({
    where: { id },
    data: {
      name: input.name,
      message: input.message,
      angles: input.angles,
      hashtags: input.hashtags,
      target: input.target,
      sortOrder: input.sortOrder,
      active: input.active,
    },
  });
  return toPillar(row);
}

/** How many rows point at a pillar (what DELETE refuses over). */
export async function pillarReferences(id: string): Promise<{ posts: number; drafts: number; images: number }> {
  const [posts, drafts, images] = await Promise.all([
    prisma.blogPost.count({ where: { pillarId: id } }),
    prisma.socialDraft.count({ where: { pillarId: id } }),
    prisma.uploadedImage.count({ where: { pillarId: id } }),
  ]);
  return { posts, drafts, images };
}

/**
 * Delete a pillar. With references and no `reassignTo` → PillarError 409
 * (the counts are on the error). With `reassignTo` (an existing pillar, or
 * null to clear) the posts / drafts / images are re-pointed first.
 */
export async function deletePillar(
  id: string,
  opts: { reassignTo?: string | null } = {},
): Promise<{ ok: true; reassigned: { posts: number; drafts: number; images: number } } | null> {
  const existing = await prisma.pillar.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;
  const refs = await pillarReferences(id);
  const total = refs.posts + refs.drafts + refs.images;
  const hasReassign = opts.reassignTo !== undefined;
  if (total > 0 && !hasReassign) {
    const err = new PillarError(
      `"${id}" is still used by ${refs.posts} post(s), ${refs.drafts} social draft(s) and ${refs.images} image(s). Pass reassignTo to move them.`,
      409,
    ) as PillarError & { references?: typeof refs };
    err.references = refs;
    throw err;
  }
  let target: string | null = null;
  if (hasReassign && opts.reassignTo) {
    if (opts.reassignTo === id) throw new PillarError("Can't reassign a pillar to itself.");
    const t = await prisma.pillar.findUnique({ where: { id: opts.reassignTo }, select: { id: true } });
    if (!t) throw new PillarError(`Unknown pillar "${opts.reassignTo}" to reassign to.`, 404);
    target = t.id;
  }
  await prisma.$transaction([
    prisma.blogPost.updateMany({ where: { pillarId: id }, data: { pillarId: target } }),
    prisma.socialDraft.updateMany({ where: { pillarId: id }, data: { pillarId: target } }),
    prisma.uploadedImage.updateMany({ where: { pillarId: id }, data: { pillarId: target } }),
    prisma.pillar.delete({ where: { id } }),
  ]);
  return { ok: true, reassigned: refs };
}
