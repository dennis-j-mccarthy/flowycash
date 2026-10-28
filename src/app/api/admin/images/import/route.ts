import { passcodeError, readJson } from "@/lib/adminPasscode";
import { LibraryImportError, cleanCollection, cleanTags, importImageFromUrl, isLibrarySource } from "@/lib/library";
import { cleanPillarId } from "@/lib/pillars";
import { DB_MISSING_MESSAGE, isDatabaseConfigured } from "@/lib/prisma";

/*
  POST /api/admin/images/import
    { passcode, url, title?, credit?, source?: "stock" | "upload" | "workbook",
      collection?, tags?, pillarId? }
    → { image, url }

  Fetches the image server-side (https, ≤ 4 MB, JPEG/PNG/WebP — sniffed)
  and stores it as a library item, so a stock photo chosen in the picker is
  served from our own /api/images/<id> like everything else. The picker
  calls this before handing a search result back to the editor; the
  original provider credit is kept on the row. 413 when too large, 415 for
  other formats, 502 when the host doesn't answer.
*/

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await readJson<{
    passcode?: string;
    url?: string;
    title?: string;
    credit?: string;
    source?: string;
    collection?: string | null;
    tags?: unknown;
    pillarId?: string | null;
  }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });
  }
  const url = String(body.url ?? "").trim();
  if (!url) return Response.json({ error: "Give an image URL to import." }, { status: 400 });

  try {
    const image = await importImageFromUrl(
      {
        url,
        title: typeof body.title === "string" ? body.title.slice(0, 120) : null,
        credit: typeof body.credit === "string" ? body.credit.slice(0, 300) : null,
        source: isLibrarySource(body.source) ? body.source : "stock",
        collection: body.collection === undefined ? undefined : cleanCollection(body.collection),
        tags: cleanTags(body.tags),
        pillarId: cleanPillarId(body.pillarId),
      },
      req,
    );
    return Response.json({ image, url: image.url });
  } catch (err) {
    if (err instanceof LibraryImportError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[images/import] failed:", err);
    const msg = err instanceof Error ? err.message : "Import failed.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
