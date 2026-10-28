import { passcodeError, readJson } from "@/lib/adminPasscode";
import { DB_MISSING_MESSAGE, isDatabaseConfigured } from "@/lib/prisma";
import { PillarError, cleanPillarInput, deletePillar, updatePillar } from "@/lib/pillarStore";

/*
  /api/admin/pillars/[id]   (passcode in the JSON body)

    PATCH  { passcode, name?, message?, angles?, hashtags?, target?,
             sortOrder?, active? }                     → { pillar }
    DELETE { passcode, reassignTo? }                   → { ok, reassigned }
           409 (with `references` counts) while posts / drafts / images
           still point at it and no `reassignTo` is given. `reassignTo` is
           another pillar id, or null to clear the references.
*/

export const runtime = "nodejs";

function fail(err: unknown) {
  if (err instanceof PillarError) {
    const refs = (err as PillarError & { references?: unknown }).references;
    return Response.json({ error: err.message, ...(refs ? { references: refs } : {}) }, { status: err.status });
  }
  const msg = err instanceof Error ? err.message : "Database error";
  return Response.json({ error: msg }, { status: 500 });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson<{ passcode?: string } & Record<string, unknown>>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });
  }
  const { id } = await ctx.params;
  try {
    const input = cleanPillarInput(body);
    delete input.id; // the slug is the key; it doesn't change
    const pillar = await updatePillar(id, input);
    if (!pillar) return Response.json({ error: "Pillar not found." }, { status: 404 });
    return Response.json({ pillar });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson<{ passcode?: string; reassignTo?: string | null }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });
  }
  const { id } = await ctx.params;
  try {
    const opts =
      "reassignTo" in body
        ? { reassignTo: typeof body.reassignTo === "string" && body.reassignTo ? body.reassignTo : null }
        : {};
    const res = await deletePillar(id, opts);
    if (!res) return Response.json({ error: "Pillar not found." }, { status: 404 });
    return Response.json(res);
  } catch (err) {
    return fail(err);
  }
}
