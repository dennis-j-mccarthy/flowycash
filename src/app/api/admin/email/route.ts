import { passcodeError } from "@/lib/adminPasscode";
import { listEmailDrafts } from "@/lib/emailStore";
import { isDatabaseConfigured, DB_MISSING_MESSAGE } from "@/lib/prisma";

/*
  /api/admin/email — the newsletter drafts list (/admin/email).

    GET (header x-admin-passcode) → { items, db }   items: [] + db:false when no database

  New drafts come from POST /api/admin/email/generate; one draft lives at
  /api/admin/email/[id].
*/

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = passcodeError(req);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ items: [], db: false, message: DB_MISSING_MESSAGE });
  }
  try {
    const items = await listEmailDrafts();
    return Response.json({ items, db: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
