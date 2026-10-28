import { isDatabaseConfigured } from "@/lib/prisma";
import { getUploadedImage } from "@/lib/uploadedImages";

/*
  GET /api/images/[id] — public image server for operator uploads.

  Streams the bytea stored by /api/admin/images/upload with its real
  Content-Type. Content is keyed by id and never changes, so it is marked
  immutable and the CDN caches it for a year; the ETag is the id and an
  If-None-Match hit answers 304. 404 when missing or when there is no
  database. No passcode — Meta/Instagram fetch these URLs.
*/

export const runtime = "nodejs";
export const maxDuration = 30;

const NOT_FOUND = () =>
  new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isDatabaseConfigured() || !id || !/^[a-z0-9_-]{8,64}$/i.test(id)) return NOT_FOUND();

  const etag = `"${id}"`;
  const cacheHeaders = {
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
  };
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }

  try {
    const img = await getUploadedImage(id);
    if (!img) return NOT_FOUND();
    const bytes = new Uint8Array(img.data);
    return new Response(bytes, {
      status: 200,
      headers: {
        ...cacheHeaders,
        "Content-Type": img.mime,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${img.filename.replace(/[^\w.-]+/g, "_")}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[images] read failed:", err instanceof Error ? err.message : err);
    return NOT_FOUND();
  }
}
