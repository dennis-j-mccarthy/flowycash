import { passcodeError, readJson } from "@/lib/adminPasscode";
import { cleanEssenceInput, getBrandEssence, saveBrandEssence } from "@/lib/essenceStore";
import { isDatabaseConfigured, DB_MISSING_MESSAGE } from "@/lib/prisma";
import { loadPillars } from "@/lib/pillarStore";

/*
  /api/admin/essence — the BrandEssence singleton (/admin/essence).

    GET  (header x-admin-passcode)  → { essence, pillars, db }
    PUT  { passcode, ...fields }    → { essence }   (409 when no DB)
         fields: line, purpose, promise, doList[], dontList[],
                 voice { playful, formal, bold } (0–100), tone { … } | null

  Without a database GET still answers with the code defaults (db: false)
  so the page can show them read-only.
*/

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = passcodeError(req);
  if (denied) return denied;
  const [essence, pillars] = await Promise.all([getBrandEssence(), loadPillars()]);
  return Response.json({ essence, pillars, db: isDatabaseConfigured() });
}

export async function PUT(req: Request) {
  const body = await readJson<{ passcode?: string } & Record<string, unknown>>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });
  }
  try {
    const essence = await saveBrandEssence(cleanEssenceInput(body));
    return Response.json({ essence, db: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
