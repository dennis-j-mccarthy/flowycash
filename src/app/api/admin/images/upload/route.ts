import { passcodeError } from "@/lib/adminPasscode";
import { slugify } from "@/lib/blogStore";
import { cleanCollection, cleanTags, isLibrarySource, saveLibraryImage } from "@/lib/library";
import { cleanPillarId } from "@/lib/pillars";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  measureImage,
  sniffImage,
  uploadBackend,
} from "@/lib/uploadedImages";

/*
  /api/admin/images/upload — the picker's Upload tab.

    GET   (header x-admin-passcode)   → { configured, backend: "db" | null, maxBytes }
    POST  multipart: file, passcode,
          title?, collection?, tags? (comma), pillarId?, source? (upload|stock|workbook)
                                      → { url, width, height, id, image }

  Every upload is a LIBRARY item (src/lib/library.ts): the optional fields
  are its metadata; a filename like "brand__logo.png" sets the collection
  and title on its own.

  Bytes are stored in Postgres (UploadedImage) and `url` is the absolute,
  public https://www.flowycash.com/api/images/<id> — Meta/Instagram can
  fetch it. Without DIRECT_DATABASE_URL → 409 { configured:false }.

  JPEG, PNG or WebP only (sniffed, not trusted by extension), at most 4 MB:
  Vercel functions refuse request bodies above ~4.5 MB, so the cap keeps the
  error readable. Uploads carry no credit line.
*/

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = passcodeError(req);
  if (denied) return denied;
  const backend = uploadBackend();
  return Response.json({ configured: backend !== null, backend, maxBytes: MAX_UPLOAD_BYTES });
}

export async function POST(req: Request) {
  // Reject oversize bodies before buffering them when the browser tells us.
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json(
      { error: `That file is over ${MAX_UPLOAD_LABEL} — resize or compress it first.` },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected a multipart form with a file." }, { status: 400 });
  }
  const passcode = form.get("passcode");
  const denied = passcodeError(req, { passcode: typeof passcode === "string" ? passcode : "" });
  if (denied) return denied;

  const backend = uploadBackend();
  if (!backend) {
    return Response.json(
      {
        error: "Uploads aren't configured — set DIRECT_DATABASE_URL.",
        configured: false,
      },
      { status: 409 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file in the upload." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      {
        error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_LABEL}. Resize or compress it first.`,
      },
      { status: 413 },
    );
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) {
    return Response.json({ error: "Only JPEG, PNG or WebP images are accepted." }, { status: 415 });
  }
  const { width, height } = measureImage(buf);
  // "{collection}__{slug}.jpg" is the library's naming convention — keep the
  // double underscore through slugify so the collection survives.
  const stem = file.name.replace(/\.[a-z0-9]+$/i, "");
  const sep = stem.indexOf("__");
  const base =
    sep > 0
      ? `${slugify(stem.slice(0, sep)) || "images"}__${slugify(stem.slice(sep + 2)) || "image"}`
      : slugify(stem) || "image";
  const filename = `${base}.${kind.ext}`;

  // Library metadata (optional fields on the same form).
  const title = typeof form.get("title") === "string" ? (form.get("title") as string).slice(0, 120) : null;
  const collectionRaw = form.get("collection");
  const sourceRaw = form.get("source");
  const pillarRaw = form.get("pillarId");
  try {
    const saved = await saveLibraryImage(
      {
        data: buf,
        mime: kind.mime,
        filename,
        width,
        height,
        title,
        collection: typeof collectionRaw === "string" && collectionRaw.trim() ? cleanCollection(collectionRaw) : undefined,
        tags: cleanTags(form.get("tags")),
        pillarId: cleanPillarId(pillarRaw),
        source: isLibrarySource(sourceRaw) ? sourceRaw : "upload",
      },
      req,
    );
    return Response.json({ url: saved.url, width: saved.width, height: saved.height, id: saved.id, image: saved });
  } catch (err) {
    console.error("[images/upload] db save failed:", err);
    const msg = err instanceof Error ? err.message : "Upload failed.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
