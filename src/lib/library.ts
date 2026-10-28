import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import { slugify } from "@/lib/blogStore";
import { cleanPillarId } from "@/lib/pillars";
import {
  MAX_UPLOAD_BYTES,
  measureImage,
  publicImageUrl,
  sniffImage,
  type UploadedImageMeta,
} from "@/lib/uploadedImages";

/*
  The Library — SERVER ONLY. Every image the site uses lives here, as an
  `UploadedImage` row (bytes in Postgres, served from /api/images/[id]) plus
  the metadata migration 0006 added: title, collection, tags, pillarId,
  credit, source (upload | stock | workbook).

  "The library dictates which images": the post maker and the hero pickers
  list this; stock photos chosen in the picker are IMPORTED here first
  (importImageFromUrl) so there is never an image on the site that isn't a
  library item.

    listLibrary({ collection, pillarId, tag, q, limit })   newest first
    listCollections()                                     distinct names
    getLibraryImage(id)                                   one, no bytes
    updateLibraryImage(id, patch)                         metadata only
    importImageFromUrl({ url, … })                        fetch + store
*/

export type LibrarySource = "upload" | "stock" | "workbook";

export interface LibraryImage extends UploadedImageMeta {
  title: string;
  collection: string | null;
  tags: string[];
  pillarId: string | null;
  credit: string | null;
  source: LibrarySource;
}

export interface LibraryFilter {
  collection?: string | null;
  pillarId?: string | null;
  tag?: string | null;
  q?: string | null;
  limit?: number;
}

export { publicImageUrl };

const SELECT = {
  id: true,
  filename: true,
  mime: true,
  size: true,
  width: true,
  height: true,
  createdAt: true,
  title: true,
  collection: true,
  tags: true,
  pillarId: true,
  credit: true,
  source: true,
} as const;

type Row = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
  title: string | null;
  collection: string | null;
  tags: string[];
  pillarId: string | null;
  credit: string | null;
  source: string;
};

/** A readable title from a filename ("gallery__cafe-owner.jpg" → "Cafe Owner"). */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "");
  const slug = base.includes("__") ? base.split("__").slice(1).join(" ") : base;
  return slug
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function collectionFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[a-z0-9]+$/i, "");
  if (!base.includes("__")) return null;
  return cleanCollection(base.split("__")[0]);
}

export function isLibrarySource(v: unknown): v is LibrarySource {
  return v === "upload" || v === "stock" || v === "workbook";
}

export function cleanCollection(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 _-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return s || null;
}

export function cleanTags(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",") : [];
  const out: string[] = [];
  for (const t of raw) {
    const s = t.trim().toLowerCase().replace(/^#/, "").slice(0, 40);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= 20) break;
  }
  return out;
}

export function toLibraryImage(row: Row, req?: Request): LibraryImage {
  return {
    id: row.id,
    url: publicImageUrl(row.id, req),
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt.toISOString(),
    title: row.title || titleFromFilename(row.filename),
    collection: row.collection,
    tags: row.tags ?? [],
    pillarId: row.pillarId,
    credit: row.credit,
    source: isLibrarySource(row.source) ? row.source : "upload",
  };
}

/* ───────── reads ───────── */

export async function listLibrary(filter: LibraryFilter = {}, req?: Request): Promise<LibraryImage[]> {
  const limit = Math.min(Math.max(1, filter.limit ?? 60), 200);
  const where: Record<string, unknown> = {};
  if (filter.collection) where.collection = filter.collection;
  if (filter.pillarId) where.pillarId = filter.pillarId;
  if (filter.tag) where.tags = { has: filter.tag.toLowerCase() };
  const q = filter.q?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { filename: { contains: q, mode: "insensitive" } },
      { credit: { contains: q, mode: "insensitive" } },
      { collection: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
    ];
  }
  const rows = await prisma.uploadedImage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: SELECT,
  });
  return rows.map((r) => toLibraryImage(r, req));
}

/** Distinct collection names with counts, most-used first. */
export async function listCollections(): Promise<{ name: string; count: number }[]> {
  const groups = await prisma.uploadedImage.groupBy({
    by: ["collection"],
    _count: { _all: true },
    where: { collection: { not: null } },
  });
  return groups
    .filter((g) => g.collection)
    .map((g) => ({ name: g.collection as string, count: g._count._all }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getLibraryImage(id: string, req?: Request): Promise<LibraryImage | null> {
  const row = await prisma.uploadedImage.findUnique({ where: { id }, select: SELECT });
  return row ? toLibraryImage(row, req) : null;
}

/* ───────── writes ───────── */

export interface LibraryPatch {
  title?: string;
  collection?: string | null;
  tags?: string[];
  pillarId?: string | null;
  credit?: string | null;
}

/** Normalise a metadata payload (partial). Unknown keys are ignored. */
export function cleanLibraryPatch(input: unknown): LibraryPatch {
  const e = (input ?? {}) as Record<string, unknown>;
  const out: LibraryPatch = {};
  if ("title" in e) out.title = String(e.title ?? "").trim().slice(0, 120);
  if ("collection" in e) out.collection = cleanCollection(e.collection);
  if ("tags" in e) out.tags = cleanTags(e.tags);
  if ("pillarId" in e) out.pillarId = e.pillarId ? cleanPillarId(e.pillarId) : null;
  if ("credit" in e) {
    const c = String(e.credit ?? "").trim().slice(0, 300);
    out.credit = c || null;
  }
  return out;
}

export async function updateLibraryImage(id: string, patch: LibraryPatch, req?: Request): Promise<LibraryImage | null> {
  const existing = await prisma.uploadedImage.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;
  const row = await prisma.uploadedImage.update({
    where: { id },
    data: {
      title: patch.title === undefined ? undefined : patch.title || null,
      collection: patch.collection,
      tags: patch.tags,
      pillarId: patch.pillarId,
      credit: patch.credit,
    },
    select: SELECT,
  });
  return toLibraryImage(row, req);
}

export interface SaveLibraryInput {
  data: Uint8Array<ArrayBuffer>;
  mime: string;
  filename: string;
  width: number | null;
  height: number | null;
  title?: string | null;
  collection?: string | null;
  tags?: string[];
  pillarId?: string | null;
  credit?: string | null;
  source?: LibrarySource;
}

/** Store bytes + metadata as one library item. */
export async function saveLibraryImage(input: SaveLibraryInput, req?: Request): Promise<LibraryImage> {
  const filename = input.filename.slice(0, 200);
  const row = await prisma.uploadedImage.create({
    data: {
      data: input.data,
      mime: input.mime,
      size: input.data.byteLength,
      width: input.width,
      height: input.height,
      filename,
      title: (input.title ?? "").trim().slice(0, 120) || titleFromFilename(filename),
      collection: input.collection === undefined ? collectionFromFilename(filename) : input.collection,
      tags: input.tags ?? [],
      pillarId: input.pillarId ?? null,
      credit: input.credit?.trim().slice(0, 300) || null,
      source: input.source ?? "upload",
    },
    select: SELECT,
  });
  return toLibraryImage(row, req);
}

export class LibraryImportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "LibraryImportError";
    this.status = status;
  }
}

const IMPORT_TIMEOUT_MS = 20_000;

/**
 * Fetch a remote image (https, ≤ 4 MB, JPEG/PNG/WebP — sniffed) and store it
 * as a library item. This is how a stock photo becomes "ours": the picker
 * calls POST /api/admin/images/import before handing the URL back.
 */
export async function importImageFromUrl(
  input: {
    url: string;
    title?: string | null;
    credit?: string | null;
    collection?: string | null;
    tags?: string[];
    pillarId?: string | null;
    source?: LibrarySource;
  },
  req?: Request,
): Promise<LibraryImage> {
  if (!isDatabaseConfigured()) throw new LibraryImportError("The library needs a database.", 409);
  let u: URL;
  try {
    u = new URL(input.url);
  } catch {
    throw new LibraryImportError("That isn't a valid image URL.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new LibraryImportError("Only http(s) image URLs can be imported.");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IMPORT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(u, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "flowycash-library/1.0 (+https://www.flowycash.com)", Accept: "image/*" },
    });
  } catch (err) {
    clearTimeout(timer);
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new LibraryImportError(timedOut ? "The image host didn't answer in time." : "Couldn't fetch that image.", 502);
  }
  clearTimeout(timer);
  if (!res.ok) throw new LibraryImportError(`The image host answered ${res.status}.`, 502);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_UPLOAD_BYTES) {
    throw new LibraryImportError(`That image is ${(declared / 1024 / 1024).toFixed(1)} MB — the library caps at 4 MB.`, 413);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    throw new LibraryImportError(`That image is ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB — the library caps at 4 MB.`, 413);
  }
  const kind = sniffImage(buf);
  if (!kind) throw new LibraryImportError("Only JPEG, PNG or WebP images can be imported.", 415);
  const { width, height } = measureImage(buf);
  const base =
    slugify((input.title ?? "").trim()) ||
    slugify(decodeURIComponent(u.pathname.split("/").pop() || "").replace(/\.[a-z0-9]+$/i, "")) ||
    "image";
  const collection = input.collection === undefined ? "stock" : input.collection;
  return saveLibraryImage(
    {
      data: buf,
      mime: kind.mime,
      filename: `${collection ? `${collection}__` : ""}${base}.${kind.ext}`,
      width,
      height,
      title: input.title,
      collection,
      tags: input.tags ?? [],
      pillarId: input.pillarId ?? null,
      credit: input.credit,
      source: input.source ?? "stock",
    },
    req,
  );
}
