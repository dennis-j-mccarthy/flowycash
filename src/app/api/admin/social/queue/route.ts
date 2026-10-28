import { passcodeError, readJson } from "@/lib/adminPasscode";
import { isDatabaseConfigured, DB_MISSING_MESSAGE } from "@/lib/prisma";
import { getConnection, isConnected } from "@/lib/meta/store";
import { cancelScheduled, listQueue } from "@/lib/socialQueue";

/*
  /api/admin/social/queue — what's scheduled and what went out.

    GET  (header x-admin-passcode)             → { items, db }
    POST { passcode, action: "cancel", draftId } delete the scheduled Graph
                                                 object with the Page token
                                                 and return the row to draft

  Only "scheduled" rows can be cancelled — a published post is not deleted
  from here (that's a deliberate, separate act on Facebook itself).
*/

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = passcodeError(req);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ items: [], db: false, message: DB_MISSING_MESSAGE });
  }
  try {
    const items = await listQueue();
    return Response.json({ items, db: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await readJson<{ passcode?: string; action?: string; draftId?: string }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });
  }
  if (body.action !== "cancel") {
    return Response.json({ error: `Unknown action: ${body.action ?? ""}` }, { status: 400 });
  }
  const draftId = String(body.draftId ?? "").trim();
  if (!draftId) return Response.json({ error: "Missing draftId." }, { status: 400 });

  const conn = getConnection();
  if (!isConnected(conn)) {
    return Response.json(
      { error: "Facebook isn't connected — can't cancel on Meta without a Page token." },
      { status: 409 },
    );
  }
  try {
    const r = await cancelScheduled(draftId, conn.pageToken);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ ok: true, draft: r.draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cancel failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
