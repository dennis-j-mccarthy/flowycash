import { passcodeError, readJson } from "@/lib/adminPasscode";
import { cleanTone } from "@/lib/blogTone";
import { getSavedTone, saveTone } from "@/lib/essenceStore";
import { isDatabaseConfigured, DB_MISSING_MESSAGE } from "@/lib/prisma";

/*
  /api/admin/blog/tone — the tone brief (now BrandEssence.tone; the panel
  itself moved to /admin/essence, this route is kept for compatibility).

    GET  (header x-admin-passcode)         → { tone | null, db: boolean }
    PUT  { passcode, tone }                → { tone }   (409 when no DB)

  Without a database the admin UI keeps the tone in localStorage, exactly as
  before; this route just tells it so (db: false).
*/

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = passcodeError(req);
  if (denied) return denied;
  const db = isDatabaseConfigured();
  const tone = db ? await getSavedTone() : null;
  return Response.json({ tone, db });
}

export async function PUT(req: Request) {
  const body = await readJson<{ passcode?: string; tone?: unknown }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });
  }
  try {
    const tone = await saveTone(cleanTone(body.tone));
    return Response.json({ tone, db: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
