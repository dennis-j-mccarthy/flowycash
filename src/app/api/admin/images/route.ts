import { passcodeError } from "@/lib/adminPasscode";
import { listCollections, listLibrary } from "@/lib/library";
import { isDatabaseConfigured } from "@/lib/prisma";
import { MAX_UPLOAD_BYTES, uploadBackend } from "@/lib/uploadedImages";

/*
  GET /api/admin/images?limit=&collection=&pillarId=&tag=&q=   (header x-admin-passcode)

  → { configured, backend, maxBytes,
      images: [{ id, url, filename, size, width, height, createdAt,
                 title, collection, tags, pillarId, credit, source }],
      collections: [{ name, count }] }

  The Library, newest first — what /admin/library, the post maker's step ①
  and the picker's Library tab list. Filters are ANDed; `q` matches title /
  filename / credit / collection / a tag. Only the database backend keeps a
  list — on the Blob fallback (or with nothing configured) `images` is
  empty but the call still succeeds. The response stays a superset of the
  pre-0006 shape.
*/

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = passcodeError(req);
  if (denied) return denied;

  const backend = uploadBackend();
  const base = { configured: backend !== null, backend, maxBytes: MAX_UPLOAD_BYTES };
  if (!isDatabaseConfigured()) return Response.json({ ...base, images: [], collections: [] });

  const sp = new URL(req.url).searchParams;
  const limit = Number(sp.get("limit")) || 60;
  try {
    const [images, collections] = await Promise.all([
      listLibrary(
        {
          limit,
          collection: sp.get("collection"),
          pillarId: sp.get("pillarId"),
          tag: sp.get("tag"),
          q: sp.get("q"),
        },
        req,
      ),
      listCollections(),
    ]);
    return Response.json({ ...base, images, collections });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ ...base, images: [], collections: [], error: msg }, { status: 500 });
  }
}
