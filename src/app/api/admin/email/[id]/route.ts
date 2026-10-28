import { passcodeError, readJson } from "@/lib/adminPasscode";
import {
  deleteEmailDraft,
  getEmailDraft,
  isEmailStatus,
  updateEmailDraft,
  type EmailDraftPatch,
} from "@/lib/emailStore";
import { isDatabaseConfigured, DB_MISSING_MESSAGE } from "@/lib/prisma";

/*
  /api/admin/email/[id] — one EmailDraft.

    GET    (header x-admin-passcode)   → { draft }   (html + text included)
    PATCH  { passcode, ...fields }     name / subject / preheader / html / text /
                                       status ("proposed" | "ready" | "sent")
    DELETE { passcode }

  Nothing here sends mail — there is no ESP configured. "sent" is a label
  the operator sets after sending the HTML through their own tool.
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
  try {
    const draft = await getEmailDraft(id);
    if (!draft) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await readJson<{ passcode?: string } & Record<string, unknown>>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return noDb();
  const { id } = await params;
  const patch: EmailDraftPatch = {};
  for (const k of ["name", "subject", "preheader", "html", "text"] as const) {
    if (typeof body[k] === "string") patch[k] = body[k] as string;
  }
  if (isEmailStatus(body.status)) patch.status = body.status;
  try {
    const draft = await updateEmailDraft(id, patch);
    if (!draft) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const body = await readJson<{ passcode?: string }>(req);
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return noDb();
  const { id } = await params;
  const ok = await deleteEmailDraft(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
