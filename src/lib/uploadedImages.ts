import { imageSize } from "image-size";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import { site } from "@/lib/site";

/*
  Operator uploads for the image picker — server-side only.

  Backend, decided per request from the environment:

    "db"    DIRECT_DATABASE_URL set. Bytes go in Postgres (UploadedImage.data, bytea)
            and are served from /api/images/[id]. Preferred: no extra store,
            survives Blob suspensions, and the URL is on our own domain.
    "blob"  No database but BLOB_READ_WRITE_TOKEN present — legacy Vercel
            Blob path, kept only as a fallback. (Blob is suspended account-wide
            at the time of writing, so expect this to fail.)
    null    Neither; the upload route answers 409.

  Files are sniffed (JPEG / PNG / WebP) and capped at MAX_UPLOAD_BYTES (4 MB).
  Vercel serverless functions reject bodies above ~4.5 MB, so anything bigger
  never reaches us — the cap is there so the user gets a sentence instead of a
  blank 413 from the platform.
*/

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "4 MB";

export type UploadBackend = "db" | "blob";

export type ImageKind = { ext: "jpg" | "png" | "webp"; mime: "image/jpeg" | "image/png" | "image/webp" };

export interface UploadedImageMeta {
  id: string;
  url: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/**
 * FlowyCash keeps only the database backend (the Vercel Blob fallback the
 * source repo had is gone — Blob is suspended account-wide). The union type
 * stays so the picker's client code is unchanged.
 */
export function uploadBackend(): UploadBackend | null {
  if (isDatabaseConfigured()) return "db";
  return null;
}

export function isUploadConfigured(): boolean {
  return uploadBackend() !== null;
}

/** Sniff the real type from the bytes — the extension and `File.type` aren't trusted. */
export function sniffImage(buf: Uint8Array): ImageKind | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { ext: "png", mime: "image/png" };
  }
  if (
    buf.length > 12 &&
    Buffer.from(buf.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(buf.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

/** Pixel dimensions, or nulls — they're a nicety, never a reason to fail. */
export function measureImage(buf: Uint8Array): { width: number | null; height: number | null } {
  try {
    const dim = imageSize(buf);
    return { width: dim.width || null, height: dim.height || null };
  } catch {
    return { width: null, height: null };
  }
}

/**
 * Absolute public URL for a stored image. Meta/Instagram fetch this, so it
 * must be reachable from the outside: production uses site.url; in `next dev`
 * the request's own origin is used so a local upload previews locally.
 */
export function publicImageUrl(id: string, req?: Request): string {
  let base: string = site.url;
  if (process.env.NODE_ENV === "development" && req) {
    try {
      base = new URL(req.url).origin;
    } catch {
      // keep site.url
    }
  }
  return `${base}/api/images/${encodeURIComponent(id)}`;
}

export function toMeta(
  row: {
    id: string;
    filename: string;
    mime: string;
    size: number;
    width: number | null;
    height: number | null;
    createdAt: Date;
  },
  req?: Request,
): UploadedImageMeta {
  return {
    id: row.id,
    url: publicImageUrl(row.id, req),
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt.toISOString(),
  };
}

/* ───────── database backend ───────── */

export async function saveUploadedImage(
  input: {
    /** Prisma's Bytes wants a plain ArrayBuffer-backed view (what `new Uint8Array(await file.arrayBuffer())` gives). */
    data: Uint8Array<ArrayBuffer>;
    mime: string;
    filename: string;
    width: number | null;
    height: number | null;
  },
  req?: Request,
): Promise<UploadedImageMeta> {
  const row = await prisma.uploadedImage.create({
    data: {
      data: input.data,
      mime: input.mime,
      size: input.data.byteLength,
      width: input.width,
      height: input.height,
      filename: input.filename.slice(0, 200),
    },
    select: { id: true, filename: true, mime: true, size: true, width: true, height: true, createdAt: true },
  });
  return toMeta(row, req);
}

/** Newest first; never loads the bytes. */
export async function listUploadedImages(limit = 60, req?: Request): Promise<UploadedImageMeta[]> {
  const rows = await prisma.uploadedImage.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), 200),
    select: { id: true, filename: true, mime: true, size: true, width: true, height: true, createdAt: true },
  });
  return rows.map((r) => toMeta(r, req));
}

export async function getUploadedImage(id: string) {
  return prisma.uploadedImage.findUnique({ where: { id } });
}

/** True when a row was removed. */
export async function deleteUploadedImage(id: string): Promise<boolean> {
  const res = await prisma.uploadedImage.deleteMany({ where: { id } });
  return res.count > 0;
}
