import { passcodeError, readJson } from "@/lib/adminPasscode";
import { isDatabaseConfigured, DB_MISSING_MESSAGE } from "@/lib/prisma";
import { deleteSocialDraft, getSocialDraft, updateSocialDraft } from "@/lib/socialQueue";

/*
  /api/admin/social/drafts/[id]

    GET    (header x-admin-passcode)          → { draft }
    PATCH  { passcode, caption?, imageUrl? }  edit the draft text/image
    DELETE { passcode }                       remove it (any status — this only
                                              forgets the row, it does NOT
                                              delete anything on Facebook;
                                              use the queue's Cancel for that)
*/

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function noDb() {
  return Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });
}

export async function GET(req: Request, { params }: Ctx) {
  const denied = passcodeError(req);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return noDb();
  const { id } = await params;
  const draft = await getSocialDraft(id);
  if (!draft) return Response.json({ error: "Draft not found." }, { status: 404 });
  return Response.json({ draft });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await readJson<{ passcode?: string; caption?: string; imageUrl?: string | null }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return noDb();
  const { id } = await params;
  if (typeof body.caption === "string" && !body.caption.trim()) {
    return Response.json({ error: "Caption can't be empty." }, { status: 400 });
  }
  const draft = await updateSocialDraft(id, { caption: body.caption, imageUrl: body.imageUrl });
  if (!draft) return Response.json({ error: "Draft not found." }, { status: 404 });
  return Response.json({ draft });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const body = await readJson<{ passcode?: string }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return noDb();
  const { id } = await params;
  const ok = await deleteSocialDraft(id);
  if (!ok) return Response.json({ error: "Draft not found." }, { status: 404 });
  return Response.json({ ok: true });
}
