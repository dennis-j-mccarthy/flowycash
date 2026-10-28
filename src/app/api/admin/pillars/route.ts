import { passcodeError, readJson } from "@/lib/adminPasscode";
import { DB_MISSING_MESSAGE, isDatabaseConfigured } from "@/lib/prisma";
import { PillarError, cleanPillarInput, createPillar, loadAllPillars } from "@/lib/pillarStore";

/*
  /api/admin/pillars — the content pillars (rows since migration 0006).

    GET  (header x-admin-passcode) [?all=1]
         → { pillars: [{ id, name, message, angles, hashtags, target,
                         sortOrder, active }], db }
         Active pillars in display order; `all=1` includes inactive ones
         (the editor). Without a database the code defaults are returned.
    POST { passcode, id?, name, message, angles[], hashtags[], target? }
         → { pillar }   (id auto-slugged from the name; 409 on a clash)
*/

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = passcodeError(req);
  if (denied) return denied;
  const all = new URL(req.url).searchParams.get("all") === "1";
  const pillars = await loadAllPillars();
  return Response.json({ pillars: all ? pillars : pillars.filter((p) => p.active), db: isDatabaseConfigured() });
}

export async function POST(req: Request) {
  const body = await readJson<{ passcode?: string } & Record<string, unknown>>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });
  }
  try {
    const pillar = await createPillar(cleanPillarInput(body));
    return Response.json({ pillar });
  } catch (err) {
    if (err instanceof PillarError) return Response.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
