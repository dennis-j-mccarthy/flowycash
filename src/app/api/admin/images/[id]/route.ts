import { passcodeError, readJson } from "@/lib/adminPasscode";
import { cleanLibraryPatch, getLibraryImage, updateLibraryImage } from "@/lib/library";
import { DB_MISSING_MESSAGE, isDatabaseConfigured } from "@/lib/prisma";
import { deleteUploadedImage } from "@/lib/uploadedImages";

/*
  /api/admin/images/[id] — one library item.

    GET    (header x-admin-passcode)                  → { image }
    PATCH  { passcode, title?, collection?, tags?, pillarId?, credit? }
                                                      → { image }
    DELETE { passcode }                               → { ok }

  PATCH edits metadata only (the bytes never change — the public URL is
  immutable). DELETE removes the row; posts/drafts that still point at its
  /api/images/<id> URL will 404 — this is a cleanup tool, not a cascade.
*/

export const runtime = "nodejs";

const NO_DB = () => Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = passcodeError(req);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return NO_DB();
  const { id } = await ctx.params;
  try {
    const image = await getLibraryImage(id, req);
    if (!image) return Response.json({ error: "Image not found." }, { status: 404 });
    return Response.json({ image });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson<{ passcode?: string } & Record<string, unknown>>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return NO_DB();
  const { id } = await ctx.params;
  try {
    const image = await updateLibraryImage(id, cleanLibraryPatch(body), req);
    if (!image) return Response.json({ error: "Image not found." }, { status: 404 });
    return Response.json({ image });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson<{ passcode?: string }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return NO_DB();
  const { id } = await ctx.params;
  try {
    const ok = await deleteUploadedImage(id);
    if (!ok) return Response.json({ error: "Image not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
