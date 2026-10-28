import { site } from "@/lib/site";

/*
  Stock-photo search behind one `searchPhotos()` — server-side only (API
  keys live here; import this from route handlers, never from a component).

  Providers, in the order the search route prefers them:

    unsplash   needs UNSPLASH_ACCESS_KEY (https://unsplash.com/developers)
    pexels     needs PEXELS_API_KEY      (https://www.pexels.com/api/ — new keys are
                                          currently paused, kept for accounts that have one)
    pixabay    needs PIXABAY_API_KEY     (free, instant: https://pixabay.com/api/docs/)
    openverse  no key                    (https://api.openverse.org — CC-licensed photos,
                                          filtered to commercial-use licenses; this is why
                                          the picker works with zero setup)
    wikimedia  no key                    (https://commons.wikimedia.org — the Commons search
                                          API; the second keyless provider, so a hung
                                          Openverse never leaves the picker empty)

  The two keyless providers back each other up: `searchKeyless()` retries
  once on a timeout/5xx and then tries the other one, reporting which
  provider actually answered. The search route uses it whenever the chosen
  provider is keyless.

  Every provider is normalised to the same StockPhoto shape, including a
  ready-made `credit` line ("Photo by X on Unsplash", "Image by X on Pixabay",
  "Title by X, CC BY 2.0 via Openverse") that the editor stores in
  BlogPost.heroCredit and the public post page prints under the hero.

  Unsplash additionally requires a "download" ping when a photo is actually
  used — `trackDownload()` does that, called from /api/admin/images/select.

  Keys are never logged and never appear in thrown error messages.
*/

export type StockProvider = "unsplash" | "pexels" | "pixabay" | "openverse" | "wikimedia";
/** Where a picked photo came from: a search provider, or the operator's own upload. */
export type PhotoSource = StockProvider | "upload";
export type StockOrientation = "landscape" | "portrait" | "square";

/** Preference order when the caller doesn't name a provider. */
export const STOCK_PROVIDERS: StockProvider[] = ["unsplash", "pexels", "pixabay", "openverse", "wikimedia"];

/** Providers that need no key, in the order they stand in for each other. */
export const KEYLESS_PROVIDERS: StockProvider[] = ["openverse", "wikimedia"];

export const STOCK_PROVIDER_LABELS: Record<StockProvider, string> = {
  unsplash: "Unsplash",
  pexels: "Pexels",
  pixabay: "Pixabay",
  openverse: "Openverse",
  wikimedia: "Wikimedia Commons",
};

export interface StockPhoto {
  id: string;
  provider: PhotoSource;
  width: number;
  height: number;
  alt: string;
  photographer: string;
  photographerUrl: string;
  /** The photo's page on the provider's site (link this in credits). */
  pageUrl: string;
  /** Human-readable licence, e.g. "Pixabay Content License", "CC BY 2.0". */
  license: string;
  /** Ready-to-print attribution line ("" for uploads). */
  credit: string;
  /** Unsplash only: the endpoint to ping when the photo is actually used. */
  downloadLocation?: string;
  src: {
    tiny: string;
    medium: string;
    large: string;
    large2x: string;
    original: string;
    landscape: string;
  };
}

export interface StockSearchResult {
  provider: StockProvider;
  photos: StockPhoto[];
  page: number;
  perPage: number;
  nextPage: number | null;
  total: number;
}

export interface StockSearchOptions {
  query: string;
  page?: number;
  perPage?: number;
  orientation?: StockOrientation;
  /** Defaults to the first configured provider in STOCK_PROVIDERS order. */
  provider?: StockProvider;
}

export class StockImageError extends Error {
  status: number;
  /** Upstream hiccup (5xx, bad JSON) — worth a retry / the other keyless provider. */
  transient: boolean;
  constructor(message: string, status = 502, opts: { transient?: boolean } = {}) {
    super(message);
    this.name = "StockImageError";
    this.status = status;
    this.transient = opts.transient ?? false;
  }
}

/* ───────── configuration ───────── */

export function isUnsplashConfigured(): boolean {
  return !!process.env.UNSPLASH_ACCESS_KEY;
}

export function isPixabayConfigured(): boolean {
  return !!process.env.PIXABAY_API_KEY;
}

export function isPexelsConfigured(): boolean {
  return !!process.env.PEXELS_API_KEY;
}

export function isKeylessProvider(p: StockProvider): boolean {
  return KEYLESS_PROVIDERS.includes(p);
}

export function isProviderConfigured(p: StockProvider): boolean {
  if (p === "unsplash") return isUnsplashConfigured();
  if (p === "pixabay") return isPixabayConfigured();
  if (p === "pexels") return isPexelsConfigured();
  return true; // openverse + wikimedia are keyless
}

export function isStockProvider(v: unknown): v is StockProvider {
  return (
    v === "unsplash" || v === "pixabay" || v === "pexels" || v === "openverse" || v === "wikimedia"
  );
}

export function isStockOrientation(v: unknown): v is StockOrientation {
  return v === "landscape" || v === "portrait" || v === "square";
}

/** Usable providers, in preference order (never empty — the keyless ones are always in). */
export function configuredProviders(): StockProvider[] {
  return STOCK_PROVIDERS.filter(isProviderConfigured);
}

export function defaultProvider(): StockProvider {
  return configuredProviders()[0] ?? "openverse";
}

/* ───────── shared fetch plumbing ───────── */

const TIMEOUT_MS = 15_000;
/** The keyless APIs are slower and get a retry, so they're given more rope. */
const KEYLESS_TIMEOUT_MS = 20_000;
const USER_AGENT = `flowycash-creator/1.0 (${site.url}; stock image picker)`;

type Json = Record<string, unknown>;

type GetJsonOptions = {
  keyHint?: string;
  timeoutMs?: number;
  /** Extra attempts after a timeout, network failure or 5xx (never on 4xx/429). */
  retries?: number;
};

async function getJson(
  label: string,
  url: string,
  headers: Record<string, string>,
  opts: GetJsonOptions = {},
): Promise<Json> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const attempts = 1 + Math.max(0, opts.retries ?? 0);
  let lastErr: StockImageError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await getJsonOnce(label, url, headers, { ...opts, timeoutMs });
    } catch (err) {
      if (!(err instanceof StockImageError)) throw err;
      lastErr = err;
      const retryable = err.status === 504 || err.transient;
      if (!retryable || attempt === attempts) throw err;
      console.warn(`[stockImages] ${label} attempt ${attempt} failed (${err.message}); retrying`);
    }
  }
  throw lastErr ?? new StockImageError(`${label} failed.`, 502);
}

async function getJsonOnce(
  label: string,
  url: string,
  headers: Record<string, string>,
  opts: GetJsonOptions & { timeoutMs: number },
): Promise<Json> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT, ...headers },
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new StockImageError(
      timedOut
        ? `${label} didn't answer within ${Math.round(opts.timeoutMs / 1000)}s — try again.`
        : `Couldn't reach ${label} — check the network and try again.`,
      504,
    );
  }

  if (!res.ok) {
    // Error bodies are small and never echo the key; keep a slice for context.
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 160);
    const hint = opts.keyHint ? ` — check ${opts.keyHint}` : "";
    // Unsplash reports an exhausted hourly quota as 403 "Rate Limit Exceeded".
    if (res.status === 429 || (res.status === 403 && /rate limit/i.test(detail))) {
      throw new StockImageError(`${label} is rate-limiting us — wait a minute and try again.`, 429);
    }
    if (res.status === 401 || res.status === 403) {
      throw new StockImageError(`${label} rejected the request (${res.status})${hint}.`, 502);
    }
    if (res.status >= 400 && res.status < 500) {
      throw new StockImageError(
        `${label} refused the search (${res.status})${detail ? `: ${detail}` : ""}`,
        502,
      );
    }
    throw new StockImageError(
      `${label} is having trouble (${res.status}) — try again shortly.`,
      502,
      { transient: true },
    );
  }

  try {
    return (await res.json()) as Json;
  } catch {
    throw new StockImageError(`${label} returned something that wasn't JSON.`, 502, { transient: true });
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampInt(v: number | undefined, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/* ───────── Unsplash ───────── */

const UNSPLASH_API = "https://api.unsplash.com";
const UNSPLASH_UTM = "utm_source=built_with_ai&utm_medium=referral";

const UNSPLASH_ORIENTATION: Record<StockOrientation, string> = {
  landscape: "landscape",
  portrait: "portrait",
  square: "squarish",
};

function withUtm(url: string): string {
  if (!url) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${UNSPLASH_UTM}`;
}

async function searchUnsplash(
  query: string,
  page: number,
  perPage: number,
  orientation: StockOrientation,
): Promise<StockSearchResult> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new StockImageError("Unsplash isn't configured (UNSPLASH_ACCESS_KEY).", 409);

  const per = clampInt(perPage, 1, 30, 24); // Unsplash caps per_page at 30
  const url = new URL(`${UNSPLASH_API}/search/photos`);
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(per));
  url.searchParams.set("orientation", UNSPLASH_ORIENTATION[orientation]);
  url.searchParams.set("content_filter", "high");

  const data = await getJson(
    "Unsplash",
    url.toString(),
    { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    { keyHint: "UNSPLASH_ACCESS_KEY" },
  );
  const results = Array.isArray(data.results) ? (data.results as Json[]) : [];

  const photos: StockPhoto[] = results.map((r) => {
    const urls = (r.urls ?? {}) as Record<string, unknown>;
    const links = (r.links ?? {}) as Record<string, unknown>;
    const user = (r.user ?? {}) as Record<string, unknown>;
    const userLinks = (user.links ?? {}) as Record<string, unknown>;
    const name = str(user.name) || str(user.username) || "Unknown";
    const regular = str(urls.regular) || str(urls.full);
    return {
      id: str(r.id),
      provider: "unsplash",
      width: num(r.width),
      height: num(r.height),
      alt: str(r.alt_description) || str(r.description),
      photographer: name,
      photographerUrl: withUtm(str(userLinks.html)),
      pageUrl: withUtm(str(links.html)),
      license: "Unsplash License",
      credit: `Photo by ${name} on Unsplash`,
      downloadLocation: str(links.download_location) || undefined,
      src: {
        tiny: str(urls.thumb) || str(urls.small),
        medium: str(urls.small) || regular,
        large: regular,
        large2x: regular,
        original: str(urls.full) || regular,
        landscape: regular,
      },
    };
  });

  const totalPages = num(data.total_pages);
  return {
    provider: "unsplash",
    photos,
    page,
    perPage: per,
    nextPage: totalPages > page ? page + 1 : null,
    total: num(data.total),
  };
}

/**
 * Unsplash's API guidelines require a hit on the photo's `download_location`
 * whenever a photo is actually used (it counts as a "download" for the
 * photographer). Only Unsplash API URLs are accepted — the value comes from
 * the browser. Never throws: this must not break the pick.
 */
export async function trackDownload(provider: StockProvider, downloadLocation: string): Promise<boolean> {
  if (provider !== "unsplash") return false;
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key || !downloadLocation.startsWith(`${UNSPLASH_API}/`)) return false;
  try {
    const res = await fetch(downloadLocation, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1", "user-agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ───────── Pexels ───────── */

async function searchPexels(
  query: string,
  page: number,
  perPage: number,
  orientation: StockOrientation,
): Promise<StockSearchResult> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new StockImageError("Pexels isn't configured (PEXELS_API_KEY).", 409);

  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(clampInt(perPage, 1, 80, 24)));
  url.searchParams.set("orientation", orientation);

  const data = await getJson("Pexels", url.toString(), { Authorization: key }, { keyHint: "PEXELS_API_KEY" });
  const raw = Array.isArray(data.photos) ? (data.photos as Json[]) : [];

  const photos: StockPhoto[] = raw.map((p) => {
    const src = (p.src ?? {}) as Record<string, unknown>;
    const photographer = str(p.photographer) || "Unknown";
    return {
      id: str(p.id),
      provider: "pexels",
      width: num(p.width),
      height: num(p.height),
      alt: str(p.alt),
      photographer,
      photographerUrl: str(p.photographer_url),
      pageUrl: str(p.url),
      license: "Pexels License",
      credit: `Photo by ${photographer} on Pexels`,
      src: {
        tiny: str(src.tiny) || str(src.small) || str(src.medium),
        medium: str(src.medium) || str(src.large),
        large: str(src.large) || str(src.original),
        large2x: str(src.large2x) || str(src.large) || str(src.original),
        original: str(src.original),
        landscape: str(src.landscape) || str(src.large) || str(src.original),
      },
    };
  });

  return {
    provider: "pexels",
    photos,
    page: num(data.page) || page,
    perPage: num(data.per_page) || perPage,
    nextPage: data.next_page ? page + 1 : null,
    total: num(data.total_results),
  };
}

/* ───────── Pixabay ───────── */

const PIXABAY_ORIENTATION: Record<StockOrientation, string> = {
  landscape: "horizontal",
  portrait: "vertical",
  square: "all", // Pixabay has no square filter
};

async function searchPixabay(
  query: string,
  page: number,
  perPage: number,
  orientation: StockOrientation,
): Promise<StockSearchResult> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new StockImageError("Pixabay isn't configured (PIXABAY_API_KEY).", 409);

  // Pixabay wants per_page between 3 and 200 and a query of at most 100 chars.
  const per = clampInt(perPage, 3, 200, 24);
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", key);
  url.searchParams.set("q", query.slice(0, 100));
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("orientation", PIXABAY_ORIENTATION[orientation]);
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("per_page", String(per));
  url.searchParams.set("page", String(page));

  const data = await getJson("Pixabay", url.toString(), {}, { keyHint: "PIXABAY_API_KEY" });
  const hits = Array.isArray(data.hits) ? (data.hits as Json[]) : [];

  const photos: StockPhoto[] = hits.map((h) => {
    const user = str(h.user) || "Unknown";
    const medium = str(h.webformatURL); // 640px
    const large = str(h.largeImageURL) || medium; // 1280px
    return {
      id: str(h.id),
      provider: "pixabay",
      width: num(h.imageWidth) || num(h.webformatWidth),
      height: num(h.imageHeight) || num(h.webformatHeight),
      alt: str(h.tags),
      photographer: user,
      photographerUrl: h.user_id ? `https://pixabay.com/users/${user}-${str(h.user_id)}/` : "https://pixabay.com/",
      pageUrl: str(h.pageURL),
      license: "Pixabay Content License",
      credit: `Image by ${user} on Pixabay`,
      src: {
        tiny: str(h.previewURL) || medium,
        medium,
        large,
        large2x: large,
        original: large,
        landscape: large,
      },
    };
  });

  // totalHits is what's actually reachable through the API (capped at 500).
  const total = num(data.totalHits) || num(data.total);
  return {
    provider: "pixabay",
    photos,
    page,
    perPage: per,
    nextPage: page * per < total && photos.length === per ? page + 1 : null,
    total,
  };
}

/* ───────── Openverse ───────── */

const OPENVERSE_ASPECT: Record<StockOrientation, string> = {
  landscape: "wide",
  portrait: "tall",
  square: "square",
};

function ccLicense(license: string, version: string): string {
  const l = license.toLowerCase();
  if (!l) return "CC licence";
  if (l === "cc0") return "CC0 1.0";
  if (l === "pdm") return "Public Domain Mark";
  return `CC ${l.toUpperCase()}${version ? ` ${version}` : ""}`;
}

async function searchOpenverse(
  query: string,
  page: number,
  perPage: number,
  orientation: StockOrientation,
): Promise<StockSearchResult> {
  // Anonymous access: page_size is capped (20) and pagination depth is limited.
  const per = clampInt(perPage, 1, 20, 20);
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query.slice(0, 200));
  url.searchParams.set("license_type", "commercial");
  url.searchParams.set("aspect_ratio", OPENVERSE_ASPECT[orientation]);
  // JPEGs only: hero + Instagram both want a plain JPEG at a public URL.
  url.searchParams.set("extension", "jpg,jpeg");
  url.searchParams.set("mature", "false");
  url.searchParams.set("filter_dead", "true");
  url.searchParams.set("page_size", String(per));
  url.searchParams.set("page", String(page));

  // Openverse has been hanging for whole minutes at a time: give it 20s,
  // retry once, and let searchKeyless() fall through to Wikimedia after that.
  const data = await getJson("Openverse", url.toString(), {}, { timeoutMs: KEYLESS_TIMEOUT_MS, retries: 1 });
  const results = Array.isArray(data.results) ? (data.results as Json[]) : [];

  const photos: StockPhoto[] = results
    .map((r): StockPhoto | null => {
      const full = str(r.url);
      if (!full) return null;
      const thumb = str(r.thumbnail) || full;
      const creator = str(r.creator) || "Unknown";
      const title = str(r.title) || "Photo";
      const license = ccLicense(str(r.license), str(r.license_version));
      return {
        id: str(r.id),
        provider: "openverse",
        width: num(r.width),
        height: num(r.height),
        alt: title,
        photographer: creator,
        photographerUrl: str(r.creator_url) || str(r.foreign_landing_url),
        pageUrl: str(r.foreign_landing_url) || str(r.detail_url),
        license,
        credit: `${title} by ${creator}, ${license} via Openverse`,
        src: {
          tiny: thumb,
          medium: thumb,
          large: full,
          large2x: full,
          original: full,
          landscape: full,
        },
      };
    })
    .filter((p): p is StockPhoto => p !== null);

  const pageCount = num(data.page_count);
  return {
    provider: "openverse",
    photos,
    page: num(data.page) || page,
    perPage: num(data.page_size) || per,
    nextPage: pageCount > page ? page + 1 : null,
    total: num(data.result_count),
  };
}

/* ───────── Wikimedia Commons ───────── */

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const WIKIMEDIA_MIN_WIDTH = 800;
/** Rendered sizes we ask Commons for (never above the original's width). */
const WIKIMEDIA_LARGE = 1280;
const WIKIMEDIA_LARGE2X = 2048;

/** Commons' `Artist` field is HTML (links, flag icons); keep just the words. */
function stripHtml(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstHref(html: string): string {
  const m = /href=["']([^"']+)["']/i.exec(html);
  if (!m) return "";
  const href = m[1];
  return href.startsWith("//") ? `https:${href}` : href;
}

/** Drop the `?utm_*` tail Commons appends to image URLs — Meta fetches them bare. */
function bareUrl(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

/**
 * A Commons thumbnail URL at `px` wide, derived from the one the API gave us
 * (…/thumb/a/a3/Name.jpg/640px-Name.jpg). Commons refuses sizes above the
 * original, so callers cap `px` at the file's width; when the API handed us
 * the original (small files), there is nothing to derive from.
 */
function wikimediaThumbAt(thumbUrl: string, px: number): string | null {
  const bare = bareUrl(thumbUrl);
  if (!/\/thumb\//.test(bare)) return null;
  const next = bare.replace(/\/\d+px-([^/]+)$/, `/${px}px-$1`);
  return next === bare ? null : next;
}

function wikimediaTitle(pageTitle: string): string {
  return pageTitle
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/_/g, " ")
    .trim();
}

// Commons search has no aspect-ratio filter, so orientation isn't a parameter here.
async function searchWikimedia(query: string, page: number, perPage: number): Promise<StockSearchResult> {
  const per = clampInt(perPage, 1, 50, 20);
  const url = new URL(WIKIMEDIA_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `filetype:bitmap ${query.slice(0, 200)}`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(per));
  url.searchParams.set("gsroffset", String((page - 1) * per));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|mime|extmetadata");
  url.searchParams.set("iiurlwidth", "640");
  url.searchParams.set("iiextmetadatafilter", "Artist|LicenseShortName|ImageDescription");

  // Wikimedia requires a descriptive User-Agent (getJson always sends ours).
  const data = await getJson("Wikimedia Commons", url.toString(), {}, { timeoutMs: KEYLESS_TIMEOUT_MS, retries: 1 });
  const queryObj = (data.query ?? {}) as Json;
  const pagesObj = (queryObj.pages ?? {}) as Record<string, Json>;
  const pages = Object.values(pagesObj).sort((a, b) => num(a.index) - num(b.index));

  const photos: StockPhoto[] = pages
    .map((p): StockPhoto | null => {
      const infos = Array.isArray(p.imageinfo) ? (p.imageinfo as Json[]) : [];
      const ii = infos[0];
      if (!ii) return null;
      const original = bareUrl(str(ii.url));
      if (!original) return null;
      const mime = str(ii.mime).toLowerCase();
      const isJpegOrPng = mime ? mime === "image/jpeg" || mime === "image/png" : /\.(jpe?g|png)$/i.test(original);
      if (!isJpegOrPng) return null;
      const width = num(ii.width);
      const height = num(ii.height);
      if (width < WIKIMEDIA_MIN_WIDTH) return null;

      const thumb = bareUrl(str(ii.thumburl)) || original;
      const meta = (ii.extmetadata ?? {}) as Record<string, Json>;
      const artistHtml = str(meta.Artist?.value);
      const artist = stripHtml(artistHtml) || "Unknown";
      const license = stripHtml(str(meta.LicenseShortName?.value)) || "see file page";
      const pageUrl = str(ii.descriptionurl) || `https://commons.wikimedia.org/wiki/${encodeURIComponent(str(p.title))}`;
      const title = wikimediaTitle(str(p.title)) || "Image";
      const description = stripHtml(str(meta.ImageDescription?.value)).slice(0, 200);

      const large = (width > WIKIMEDIA_LARGE && wikimediaThumbAt(thumb, WIKIMEDIA_LARGE)) || original;
      const large2x = (width > WIKIMEDIA_LARGE2X && wikimediaThumbAt(thumb, WIKIMEDIA_LARGE2X)) || original;

      return {
        id: str(p.pageid) || title,
        provider: "wikimedia",
        width,
        height,
        alt: description || title,
        photographer: artist.slice(0, 120),
        photographerUrl: firstHref(artistHtml) || pageUrl,
        pageUrl,
        license,
        credit: `${title} by ${artist}, ${license} via Wikimedia Commons`,
        src: {
          tiny: thumb,
          medium: thumb,
          large,
          large2x,
          original,
          landscape: large,
        },
      };
    })
    .filter((p): p is StockPhoto => p !== null);

  const cont = (data.continue ?? {}) as Json;
  const hasMore = cont.gsroffset !== undefined;
  return {
    provider: "wikimedia",
    photos,
    page,
    perPage: per,
    nextPage: hasMore ? page + 1 : null,
    // The search API doesn't report a total for generator queries.
    total: hasMore ? page * per + per : (page - 1) * per + photos.length,
  };
}

/* ───────── public entry point ───────── */

export async function searchPhotos(opts: StockSearchOptions): Promise<StockSearchResult> {
  const query = opts.query.trim();
  if (!query) throw new StockImageError("Type something to search for.", 400);

  const provider = opts.provider ?? defaultProvider();
  if (!isProviderConfigured(provider)) {
    throw new StockImageError(
      `${STOCK_PROVIDER_LABELS[provider]} isn't configured on the server.`,
      409,
    );
  }

  const page = clampInt(opts.page, 1, 1000, 1);
  const perPage = clampInt(opts.perPage, 1, 80, 24);
  const orientation: StockOrientation = opts.orientation ?? "landscape";

  if (provider === "unsplash") return searchUnsplash(query, page, perPage, orientation);
  if (provider === "pexels") return searchPexels(query, page, perPage, orientation);
  if (provider === "pixabay") return searchPixabay(query, page, perPage, orientation);
  if (provider === "wikimedia") return searchWikimedia(query, page, perPage);
  return searchOpenverse(query, page, perPage, orientation);
}

export interface KeylessSearchResult extends StockSearchResult {
  /** The provider that was asked for, when a different one answered. */
  fellBackFrom?: StockProvider;
  /** Why the requested provider was abandoned (its error, or "no results"). */
  fallbackReason?: string;
}

/**
 * Search a keyless provider and, when it errors (after its own retry) or
 * returns nothing on page 1, try the other keyless provider once. The result
 * says which provider actually answered. A 400/409 is the caller's mistake and
 * is never masked; "Load more" pages (page > 1) don't fall back either, since
 * the grid already holds the first provider's photos.
 */
export async function searchKeyless(opts: StockSearchOptions): Promise<KeylessSearchResult> {
  const requested = opts.provider ?? defaultProvider();
  if (!isKeylessProvider(requested)) return searchPhotos(opts);

  const page = clampInt(opts.page, 1, 1000, 1);
  const alternate = KEYLESS_PROVIDERS.find((p) => p !== requested);
  if (!alternate || page > 1) return searchPhotos({ ...opts, provider: requested });

  let reason: string;
  try {
    const first = await searchPhotos({ ...opts, provider: requested });
    if (first.photos.length > 0) return first;
    reason = "no results";
  } catch (err) {
    if (!(err instanceof StockImageError) || err.status === 400 || err.status === 409) throw err;
    reason = err.message;
    console.warn(`[stockImages] ${requested} failed (${reason}); trying ${alternate}`);
  }

  try {
    const second = await searchPhotos({ ...opts, provider: alternate });
    return { ...second, fellBackFrom: requested, fallbackReason: reason };
  } catch (err) {
    if (err instanceof StockImageError && reason !== "no results") {
      // Both keyless providers are down: say so in one line.
      throw new StockImageError(
        `${STOCK_PROVIDER_LABELS[requested]}: ${reason} ${STOCK_PROVIDER_LABELS[alternate]}: ${err.message}`,
        err.status === 429 ? 429 : 504,
      );
    }
    throw err;
  }
}
