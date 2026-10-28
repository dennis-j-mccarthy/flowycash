/*
  Shared admin gate for the content-system routes.

  Convention in this repo: the admin passcode travels in the JSON body as
  `passcode` and is compared to ADMIN_PASSCODE. GET requests have no body, so
  those routes also accept the same value in an `x-admin-passcode` header.
  Returns a ready-to-send Response on failure, or null when the caller may
  proceed. Never logs the passcode.
*/

export function passcodeError(
  req: Request,
  body?: { passcode?: unknown } | null,
): Response | null {
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) {
    return Response.json(
      { error: "Server missing ADMIN_PASSCODE — admin tools are disabled." },
      { status: 500 },
    );
  }
  const fromBody = typeof body?.passcode === "string" ? body.passcode : "";
  const supplied = fromBody || req.headers.get("x-admin-passcode") || "";
  if (supplied !== expected) {
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }
  return null;
}

/** Parse a JSON body, tolerating an empty one (GET-like POSTs). */
export async function readJson<T extends object>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text.trim()) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
