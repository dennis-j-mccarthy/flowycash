import { passcodeError, readJson } from "@/lib/adminPasscode";
import { isStockProvider, trackDownload } from "@/lib/stockImages";

/*
  POST /api/admin/images/select  { passcode, provider, downloadLocation }
  → { ok, tracked }

  Fired (and forgotten) by the picker when a photo is chosen. For Unsplash
  it pings the photo's download_location with the app's Client-ID, which the
  Unsplash API guidelines require whenever a photo is used. Other providers
  need nothing; the call just returns ok.
*/

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await readJson<{ passcode?: string; provider?: string; downloadLocation?: string }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;

  if (!isStockProvider(body.provider)) {
    return Response.json({ ok: true, tracked: false });
  }
  const location = typeof body.downloadLocation === "string" ? body.downloadLocation : "";
  const tracked = location ? await trackDownload(body.provider, location) : false;
  return Response.json({ ok: true, tracked });
}
