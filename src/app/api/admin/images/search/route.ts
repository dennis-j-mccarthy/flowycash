import { passcodeError } from "@/lib/adminPasscode";
import {
  StockImageError,
  configuredProviders,
  defaultProvider,
  isKeylessProvider,
  isStockOrientation,
  isStockProvider,
  searchKeyless,
  searchPhotos,
} from "@/lib/stockImages";

/*
  GET /api/admin/images/search?q=&page=&orientation=&provider=
      (header x-admin-passcode)

  → { provider, providerUsed, requested, fellBackFrom?, fallbackReason?,
      configured, photos, page, perPage, nextPage, total }

    provider /   the provider that actually answered (defaults to the first
    providerUsed configured one: unsplash → pexels → pixabay → openverse → wikimedia)
    requested    the provider that was asked for
    fellBackFrom set when a keyless provider (Openverse / Wikimedia Commons)
                 errored or returned nothing and the other keyless one
                 answered instead; fallbackReason says why
    configured   every usable provider, in that order, so the picker can show
                 a switch. The two keyless providers need no key, so this is
                 never empty.

  409 { error, configured } when the caller names a provider that isn't set
  up; 400 for a missing query or a bad orientation/provider value. Upstream
  rate limits come back as 429 so the picker can say "wait a minute".
*/

export const runtime = "nodejs";
// Worst case is Openverse 20s ×2 then Wikimedia 20s ×2.
export const maxDuration = 90;

export async function GET(req: Request) {
  const denied = passcodeError(req);
  if (denied) return denied;

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") || "").trim();
  if (!q) return Response.json({ error: "Type something to search for." }, { status: 400 });

  const configured = configuredProviders();
  const providerParam = sp.get("provider");
  let provider = defaultProvider();
  if (providerParam) {
    if (!isStockProvider(providerParam)) {
      return Response.json({ error: `Unknown provider: ${providerParam}` }, { status: 400 });
    }
    if (!configured.includes(providerParam)) {
      return Response.json(
        { error: `${providerParam} isn't configured on the server.`, configured, provider: providerParam },
        { status: 409 },
      );
    }
    provider = providerParam;
  }

  const orientationParam = sp.get("orientation") || "landscape";
  if (!isStockOrientation(orientationParam)) {
    return Response.json({ error: `Unknown orientation: ${orientationParam}` }, { status: 400 });
  }

  const page = Number(sp.get("page")) || 1;
  const opts = { query: q, page, orientation: orientationParam, provider };

  try {
    const result = isKeylessProvider(provider) ? await searchKeyless(opts) : await searchPhotos(opts);
    return Response.json({
      ...result,
      providerUsed: result.provider,
      requested: provider,
      configured,
    });
  } catch (err) {
    if (err instanceof StockImageError) {
      return Response.json({ error: err.message, configured, provider }, { status: err.status });
    }
    console.error("[images/search] failed:", err);
    return Response.json({ error: "Image search failed." }, { status: 500 });
  }
}
