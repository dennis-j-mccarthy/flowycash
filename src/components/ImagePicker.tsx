"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/components/PasscodeGate";
import { usePillars } from "@/components/usePillars";
import type { PhotoSource, StockOrientation, StockPhoto, StockProvider } from "@/lib/stockImages";

/*
  Image picker — a modal over the blog editor, the generator, the post maker
  and the Library page. Three tabs, Library first:

    Library /api/admin/images — every image the site owns (src/lib/library.ts),
            newest first, with collection chips, a pillar filter and a search
            box. This is the default tab everywhere: the library dictates
            which images. Click a tile to use it.
    Search  /api/admin/images/search — Unsplash / Pexels / Pixabay /
            Openverse / Wikimedia Commons, whichever the server has
            configured (the last two need no key, so there are always at
            least two). Given `suggest`, it asks /api/admin/images/suggest
            for three queries, runs the first and shows the rest as chips.
            Choosing a photo IMPORTS it into the library first
            (POST /api/admin/images/import — fetched server-side, ≤ 4 MB,
            credit kept) and hands back the library URL, so the site never
            hot-links a stock host. Without a database it falls back to the
            provider URL as before. Unsplash picks also fire
            /api/admin/images/select so the required download ping happens.
    Upload  /api/admin/images/upload — file input or drag-and-drop with an
            optional title + collection; stored in Postgres (served from
            /api/images/<id>) or, without a database, Vercel Blob; 4 MB cap.

  Either way the caller gets a StockPhoto through onPick and decides which
  size to keep (every size is the same URL for library items) plus
  photo.credit ("" for uploads). `tabs` limits which tabs show (the Library
  page passes ["upload","search"]); `initialTab` picks the one that opens.
  Escape closes; on a phone it's a bottom sheet, on anything wider a
  centred dialog.
*/

export type { StockPhoto };

export type PickerTab = "library" | "search" | "upload";

type SearchResponse = {
  provider: StockProvider;
  providerUsed?: StockProvider;
  requested?: StockProvider;
  fellBackFrom?: StockProvider;
  fallbackReason?: string;
  configured: StockProvider[];
  photos: StockPhoto[];
  page: number;
  nextPage: number | null;
  total: number;
};

export type LibraryItem = {
  id: string;
  url: string;
  filename: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  title: string;
  collection: string | null;
  tags: string[];
  pillarId: string | null;
  credit: string | null;
  source: "upload" | "stock" | "workbook";
};

type LibraryResponse = {
  configured: boolean;
  backend: "db" | "blob" | null;
  maxBytes?: number;
  images: LibraryItem[];
  collections?: { name: string; count: number }[];
};

/** A StockPhoto for a library item / upload: one URL for every size. */
export function libraryPhoto(it: { id: string; url: string; width: number | null; height: number | null; title?: string; credit?: string | null }): StockPhoto {
  const url = it.url;
  return {
    id: it.id,
    provider: "upload",
    width: it.width ?? 0,
    height: it.height ?? 0,
    alt: it.title ?? "",
    photographer: "",
    photographerUrl: "",
    pageUrl: url,
    license: "",
    credit: it.credit ?? "",
    src: { tiny: url, medium: url, large: url, large2x: url, original: url, landscape: url },
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (photo: StockPhoto) => void;
  passcode: string;
  /** landscape for blog heroes (default), square for social. */
  orientation?: StockOrientation;
  initialQuery?: string;
  /** Ask the server for suggested queries from a post (by id) or a title/excerpt. */
  suggest?: { postId?: string; title?: string; excerpt?: string };
  heading?: string;
  /** Which tab opens (default "library" — the library dictates which images). */
  initialTab?: PickerTab;
  /** Which tabs to show (default all three). */
  tabs?: PickerTab[];
  /** Pre-filters the Library tab and tags imports / uploads with this pillar. */
  pillarId?: string | null;
  /** Default collection for imports / uploads (stock imports default to "stock"). */
  collection?: string | null;
};

const SOURCE_LABEL: Record<PhotoSource, string> = {
  unsplash: "Unsplash",
  pexels: "Pexels",
  pixabay: "Pixabay",
  openverse: "Openverse",
  wikimedia: "Wikimedia Commons",
  upload: "Upload",
};

const TAB_LABEL: Record<PickerTab, string> = { library: "Library", search: "Search", upload: "Upload" };

const ORIENTATIONS: { id: StockOrientation; label: string }[] = [
  { id: "landscape", label: "Landscape" },
  { id: "square", label: "Square" },
  { id: "portrait", label: "Portrait" },
];

// Mirrors MAX_UPLOAD_BYTES in src/lib/uploadedImages.ts (Vercel's body cap is ~4.5 MB).
const MAX_UPLOAD = 4 * 1024 * 1024;
const MAX_UPLOAD_LABEL = "4 MB";
const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];

const FIELD =
  "w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5 text-ink placeholder:text-muted/50 focus:border-accent focus:outline-none";
const CHIP = "rounded-full border-2 px-3 py-1 text-xs font-bold";
const ON = "border-accent bg-accent-soft text-accent-strong";
const OFF = "border-line text-ink hover:border-accent";
const TAB = "rounded-full px-4 py-1.5 text-sm font-bold";
const PRIMARY =
  "rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink hover:bg-accent-strong disabled:opacity-50";

export function ImagePicker({
  open,
  onClose,
  onPick,
  passcode,
  orientation: initialOrientation = "landscape",
  initialQuery = "",
  suggest,
  heading = "Pick an image",
  initialTab = "library",
  tabs = ["library", "search", "upload"],
  pillarId: pillarProp = null,
  collection: collectionProp = null,
}: Props) {
  const firstTab: PickerTab = tabs.includes(initialTab) ? initialTab : tabs[0] ?? "library";
  const [tab, setTab] = useState<PickerTab>(firstTab);
  const { pillars } = usePillars(passcode);

  // library
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [collections, setCollections] = useState<{ name: string; count: number }[]>([]);
  const [libLoaded, setLibLoaded] = useState<boolean | null>(null); // null = not asked yet
  const [libCollection, setLibCollection] = useState("");
  const [libPillar, setLibPillar] = useState("");
  const [libQ, setLibQ] = useState("");
  const [backend, setBackend] = useState<"db" | "blob" | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  // search
  const [query, setQuery] = useState(initialQuery);
  const [orientation, setOrientation] = useState<StockOrientation>(initialOrientation);
  const [provider, setProvider] = useState<StockProvider | null>(null);
  const [providersConfigured, setProvidersConfigured] = useState<StockProvider[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState("");
  const [busy, setBusy] = useState<"" | "search" | "more" | "suggest">("");
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const reqSeq = useRef(0);

  // upload
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [upTitle, setUpTitle] = useState("");
  const [upCollection, setUpCollection] = useState(collectionProp ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const hasLibrary = backend === "db";

  /** The library list — also tells us whether uploads / imports are possible. */
  const loadLibrary = useCallback(async () => {
    try {
      const d = await adminFetch<LibraryResponse>(passcode, "/api/admin/images?limit=200");
      setConfigured(!!d.configured);
      setBackend(d.backend ?? null);
      setLibrary(Array.isArray(d.images) ? d.images : []);
      setCollections(d.collections ?? []);
    } catch {
      setConfigured(false);
      setLibrary([]);
    } finally {
      setLibLoaded(true);
    }
  }, [passcode]);

  /** Hand a library item / upload back. */
  const pick = useCallback(
    (p: StockPhoto) => {
      onPick(p);
    },
    [onPick],
  );

  /**
   * A stock photo: import it into the library first (so the site serves it
   * from /api/images/<id>), then hand back the library URL with the
   * provider's credit still attached. Falls back to the provider URL when
   * there is no library (no database).
   */
  const pickStock = useCallback(
    async (p: StockPhoto) => {
      if (p.provider === "unsplash" && p.downloadLocation) {
        adminFetch(passcode, "/api/admin/images/select", {
          method: "POST",
          body: { provider: p.provider, downloadLocation: p.downloadLocation },
        }).catch(() => {});
      }
      if (!hasLibrary) {
        onPick(p);
        return;
      }
      const key = `${p.provider}:${p.id}`;
      setImporting(key);
      setError("");
      const title = (p.alt || searched || "").trim().slice(0, 120);
      const doImport = (url: string) =>
        adminFetch<{ image: LibraryItem }>(passcode, "/api/admin/images/import", {
          method: "POST",
          body: {
            url,
            title,
            credit: p.credit,
            source: "stock",
            ...(collectionProp ? { collection: collectionProp } : {}),
            tags: [p.provider],
            pillarId: libPillar || pillarProp || null,
          },
        });
      try {
        let res: { image: LibraryItem };
        try {
          res = await doImport(p.src.large2x);
        } catch (e) {
          const status = (e as Error & { status?: number }).status;
          if (status === 413 && p.src.large && p.src.large !== p.src.large2x) res = await doImport(p.src.large);
          else throw e;
        }
        const url = res.image.url;
        onPick({
          ...p,
          id: res.image.id,
          alt: p.alt || res.image.title,
          src: { tiny: url, medium: url, large: url, large2x: url, original: url, landscape: url },
        });
      } catch (e) {
        setError(`Couldn't import that photo into the library: ${(e as Error).message || "unknown error"}`);
      } finally {
        setImporting(null);
      }
    },
    [passcode, hasLibrary, onPick, searched, collectionProp, libPillar, pillarProp],
  );

  const search = useCallback(
    async (
      q: string,
      opts: { page?: number; provider?: StockProvider | null; orientation?: StockOrientation } = {},
    ) => {
      const term = q.trim();
      if (!term) return;
      const page = opts.page ?? 1;
      const prov = opts.provider === undefined ? provider : opts.provider;
      const orient = opts.orientation ?? orientation;
      const seq = ++reqSeq.current;
      setBusy(page > 1 ? "more" : "search");
      setError("");
      if (page === 1) setNotice("");
      try {
        const sp = new URLSearchParams({ q: term, page: String(page), orientation: orient });
        if (prov) sp.set("provider", prov);
        const d = await adminFetch<SearchResponse>(passcode, `/api/admin/images/search?${sp}`);
        if (seq !== reqSeq.current) return; // a newer search superseded this one
        const used = d.providerUsed || d.provider;
        setProvider(used);
        setProvidersConfigured(d.configured || []);
        if (d.fellBackFrom && d.fellBackFrom !== used) {
          const why = d.fallbackReason === "no results" ? "found nothing" : "didn't answer";
          setNotice(`${SOURCE_LABEL[d.fellBackFrom]} ${why} — showing ${SOURCE_LABEL[used]} instead.`);
        }
        setPhotos((prev) => (page > 1 ? [...prev, ...d.photos] : d.photos));
        setNextPage(d.nextPage);
        setTotal(d.total);
        setSearched(term);
      } catch (e) {
        if (seq !== reqSeq.current) return;
        setError((e as Error).message || "Search failed.");
        if (page === 1) setPhotos([]);
      } finally {
        if (seq === reqSeq.current) setBusy("");
      }
    },
    [passcode, provider, orientation],
  );

  const chooseFile = useCallback((f: File | null) => {
    setUploadError("");
    if (!f) {
      setFile(null);
      setPreview("");
      return;
    }
    if (!UPLOAD_TYPES.includes(f.type)) {
      setUploadError("Only JPEG, PNG or WebP images are accepted.");
      return;
    }
    if (f.size > MAX_UPLOAD) {
      setUploadError(
        `That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_LABEL}. Resize or compress it first.`,
      );
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setUpTitle((t) =>
      t ||
      f.name
        .replace(/\.[a-z0-9]+$/i, "")
        .split("__")
        .pop()!
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    );
  }, []);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("passcode", passcode);
      if (upTitle.trim()) form.set("title", upTitle.trim());
      if (upCollection.trim()) form.set("collection", upCollection.trim());
      const pid = libPillar || pillarProp;
      if (pid) form.set("pillarId", pid);
      const res = await fetch("/api/admin/images/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        id?: string;
        width?: number | null;
        height?: number | null;
        image?: LibraryItem;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(
          data.error ||
            (res.status === 413
              ? `That file is too big — the limit is ${MAX_UPLOAD_LABEL}.`
              : `Upload failed (${res.status})`),
        );
      }
      if (data.image) setLibrary((prev) => [data.image as LibraryItem, ...prev.filter((u) => u.id !== data.image?.id)]);
      pick(
        libraryPhoto({
          id: data.id ?? data.url,
          url: data.url,
          width: data.width ?? null,
          height: data.height ?? null,
          title: upTitle.trim(),
        }),
      );
    } catch (e) {
      setUploadError((e as Error).message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Reset + kick off when opened. The library is always fetched (it also
  // says whether imports/uploads work); suggestions decide the initial
  // search query unless the caller already gave us one.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setTab(firstTab);
    setQuery(initialQuery);
    setOrientation(initialOrientation);
    setPhotos([]);
    setNextPage(null);
    setTotal(0);
    setSearched("");
    setError("");
    setNotice("");
    setSuggestions([]);
    setFile(null);
    setPreview("");
    setUpTitle("");
    setUpCollection(collectionProp ?? "");
    setUploadError("");
    setImporting(null);
    setLibCollection("");
    setLibPillar(pillarProp ?? "");
    setLibQ("");
    setLibLoaded(null);


    void loadLibrary();

    const run = async () => {
      let first = initialQuery.trim();
      if (suggest && (suggest.postId || suggest.title)) {
        setBusy("suggest");
        try {
          const sp = new URLSearchParams();
          if (suggest.postId) sp.set("postId", suggest.postId);
          if (suggest.title) sp.set("title", suggest.title);
          if (suggest.excerpt) sp.set("excerpt", suggest.excerpt);
          const d = await adminFetch<{ queries: string[] }>(passcode, `/api/admin/images/suggest?${sp}`);
          if (cancelled) return;
          const qs = (d.queries || []).filter(Boolean);
          setSuggestions(qs);
          if (!first && qs[0]) {
            first = qs[0];
            setQuery(first);
          }
        } catch {
          // suggestions are optional
        } finally {
          if (!cancelled) setBusy("");
        }
      }
      if (cancelled) return;
      if (first) void search(first, { page: 1, provider: null, orientation: initialOrientation });
      else if (firstTab === "search") setTimeout(() => inputRef.current?.focus(), 50);
    };
    void run();
    return () => {
      cancelled = true;
    };
    // Only re-run when the dialog opens; the inputs are read once at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Free the preview blob URL when it changes or the picker unmounts.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  // Escape closes; lock the page scroll behind the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const switchable = providersConfigured.length > 1;
  const tileAspect =
    orientation === "portrait" ? "aspect-[3/4]" : orientation === "square" ? "aspect-square" : "aspect-[3/2]";

  const q = libQ.trim().toLowerCase();
  const libShown = library.filter((it) => {
    if (libCollection && it.collection !== libCollection) return false;
    if (libPillar && it.pillarId !== libPillar) return false;
    if (q) {
      const hay = `${it.title} ${it.filename} ${it.collection ?? ""} ${it.credit ?? ""} ${it.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-2 border-line bg-surface shadow-xl sm:max-h-[85dvh] sm:max-w-3xl sm:rounded-2xl"
      >
        {/* header */}
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">{heading}</h2>
            <div className="flex items-center gap-1">
              {tabs.length > 1 && (
                <div className="flex rounded-full border-2 border-line p-0.5" role="tablist">
                  {tabs.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={`${TAB} ${tab === t ? "bg-accent-soft text-accent-strong" : "text-muted hover:text-ink"}`}
                    >
                      {TAB_LABEL[t]}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-3 py-1 text-sm font-bold text-muted hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {tab === "library" && (
            <>
              <input
                className={FIELD}
                placeholder="Search the library…"
                value={libQ}
                onChange={(e) => setLibQ(e.target.value)}
                aria-label="Search the library"
              />
              {(collections.length > 0 || pillars.length > 0) && (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setLibCollection("")} className={`${CHIP} ${libCollection === "" ? ON : OFF}`}>
                    All
                  </button>
                  {collections.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setLibCollection(libCollection === c.name ? "" : c.name)}
                      className={`${CHIP} ${libCollection === c.name ? ON : OFF}`}
                    >
                      {c.name}
                    </button>
                  ))}
                  {pillars.length > 0 && (
                    <>
                      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
                      {pillars.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setLibPillar(libPillar === p.id ? "" : p.id)}
                          className={`${CHIP} ${libPillar === p.id ? ON : OFF}`}
                          title={p.message}
                        >
                          {p.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "search" && (
            <>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void search(query, { page: 1 });
                }}
              >
                <input
                  ref={inputRef}
                  className={FIELD}
                  placeholder="e.g. café owner at laptop"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search stock photos"
                />
                <button type="submit" disabled={!!busy || !query.trim()} className={`${PRIMARY} flex-none`}>
                  {busy === "search" ? "…" : "Search"}
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-2">
                {ORIENTATIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      setOrientation(o.id);
                      if (searched) void search(searched, { page: 1, orientation: o.id });
                    }}
                    className={`${CHIP} ${orientation === o.id ? ON : OFF}`}
                  >
                    {o.label}
                  </button>
                ))}
                {switchable && (
                  <>
                    <span className="mx-1 h-4 w-px bg-line" aria-hidden />
                    {providersConfigured.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setProvider(p);
                          if (searched) void search(searched, { page: 1, provider: p });
                        }}
                        className={`${CHIP} ${provider === p ? ON : OFF}`}
                      >
                        {SOURCE_LABEL[p]}
                      </button>
                    ))}
                  </>
                )}
              </div>

              {suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-bold uppercase tracking-wide">Try</span>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setQuery(s);
                        void search(s, { page: 1 });
                      }}
                      className={`${CHIP} ${searched === s ? ON : OFF}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* body */}
        <div className="min-h-[200px] flex-1 overflow-y-auto p-4">
          {tab === "library" ? (
            <>
              {libLoaded === null || libLoaded === false ? (
                <p className="text-sm text-muted">Loading the library…</p>
              ) : !hasLibrary ? (
                <p className="rounded-xl border-2 border-sun/40 bg-sun-soft/50 p-3 text-sm text-ink">
                  <b>The library needs a database.</b> Connect one (<code className="font-mono">DIRECT_DATABASE_URL</code>, then{" "}
                  <code className="font-mono">npx prisma db push</code>) and redeploy. Search still works.
                </p>
              ) : libShown.length === 0 ? (
                <p className="text-sm text-muted">
                  {library.length === 0 ? "The library is empty — upload an image or import one from Search." : "Nothing matches those filters."}
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {libShown.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => pick(libraryPhoto(it))}
                        className="group block w-full overflow-hidden rounded-xl border-2 border-line bg-paper text-left hover:border-accent focus:border-accent focus:outline-none"
                        title={`${it.title}${it.collection ? ` · ${it.collection}` : ""}${it.credit ? ` · ${it.credit}` : ""}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={it.url} alt={it.title} loading="lazy" className={`block w-full object-cover ${tileAspect}`} />
                        <span className="block truncate px-2 py-1.5 text-[11px] text-muted group-hover:text-ink">
                          {it.title}
                          {it.collection ? ` · ${it.collection}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : tab === "search" ? (
            <>
              {error && <p className="mb-3 text-sm font-semibold text-berry">{error}</p>}
              {notice && !error && (
                <p className="mb-3 rounded-xl border-2 border-sun/40 bg-sun-soft/50 px-3 py-2 text-xs text-ink">
                  {notice}
                </p>
              )}
              {importing && <p className="mb-3 text-sm font-semibold text-accent-strong">Importing into the library…</p>}
              {busy === "suggest" && <p className="text-sm text-muted">Thinking of search ideas…</p>}
              {busy === "search" && <p className="text-sm text-muted">Searching…</p>}
              {!busy && !error && searched && photos.length === 0 && (
                <p className="text-sm text-muted">Nothing for “{searched}” — try different words.</p>
              )}

              {photos.length > 0 && (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {photos.map((p) => {
                    const key = `${p.provider}:${p.id}`;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => void pickStock(p)}
                          disabled={!!importing}
                          className={`group block w-full overflow-hidden rounded-xl border-2 bg-paper text-left hover:border-accent focus:border-accent focus:outline-none disabled:opacity-60 ${
                            importing === key ? "border-accent" : "border-line"
                          }`}
                          title={p.alt || p.credit}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.src.medium}
                            alt={p.alt}
                            loading="lazy"
                            className={`block w-full object-cover ${tileAspect}`}
                          />
                          <span className="block truncate px-2 py-1.5 text-[11px] text-muted group-hover:text-ink">
                            {importing === key ? "Importing…" : `${p.photographer} · ${SOURCE_LABEL[p.provider]}`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {nextPage && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => void search(searched, { page: nextPage })}
                    disabled={!!busy}
                    className="rounded-full border-2 border-line px-5 py-2 text-sm font-bold text-ink hover:border-accent hover:text-accent-strong disabled:opacity-50"
                  >
                    {busy === "more" ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {configured === false && (
                <p className="rounded-xl border-2 border-sun/40 bg-sun-soft/50 p-3 text-sm text-ink">
                  <b>Uploads aren&rsquo;t set up.</b> Connect a database (<code className="font-mono">DIRECT_DATABASE_URL</code>
                  , then <code className="font-mono">npx prisma db push</code>) and redeploy. Search still works.
                </p>
              )}
              {uploadError && <p className="text-sm font-semibold text-berry">{uploadError}</p>}

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  chooseFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center ${
                  dragOver ? "border-accent bg-accent-soft/40" : "border-line bg-paper"
                }`}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt=""
                    className={`block max-h-[40dvh] w-auto max-w-full rounded-xl border border-line object-contain`}
                  />
                ) : (
                  <p className="text-sm text-muted">
                    Drop a JPEG, PNG or WebP here (up to {MAX_UPLOAD_LABEL}), or
                  </p>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="rounded-full border-2 border-line px-4 py-1.5 text-sm font-bold text-ink hover:border-accent hover:text-accent-strong disabled:opacity-50"
                  >
                    {file ? "Choose a different file" : "Choose a file"}
                  </button>
                  {file && (
                    <button
                      type="button"
                      onClick={() => void upload()}
                      disabled={uploading || configured === false}
                      className={PRIMARY}
                    >
                      {uploading ? "Uploading…" : "Use this image"}
                    </button>
                  )}
                </div>
                {file && (
                  <p className="text-xs text-muted">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                )}
              </div>

              {file && hasLibrary && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={FIELD} placeholder="Title (shown in the library)" value={upTitle} onChange={(e) => setUpTitle(e.target.value)} aria-label="Title" />
                  <input
                    className={FIELD}
                    placeholder="Collection (e.g. gallery)"
                    value={upCollection}
                    onChange={(e) => setUpCollection(e.target.value)}
                    aria-label="Collection"
                    list="picker-collections"
                  />
                  <datalist id="picker-collections">
                    {collections.map((c) => (
                      <option key={c.name} value={c.name} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-line px-4 py-2.5 text-xs text-muted">
          {tab === "library" ? (
            `${libShown.length}${libShown.length !== library.length ? ` of ${library.length}` : ""} in the library — every image the site uses lives here; stock picks are imported into it.`
          ) : tab === "upload" ? (
            backend === "blob"
              ? "Uploaded images are stored publicly on Vercel Blob and carry no credit line."
              : "Uploads become library items: stored in the site's database, served publicly from /api/images/…, no credit line."
          ) : provider ? (
            <>
              {total > 0 && searched && provider !== "wikimedia"
                ? `${total.toLocaleString()} results on `
                : "Searching "}
              <b>{SOURCE_LABEL[provider]}</b>
              {provider === "openverse"
                ? " — Creative Commons photos cleared for commercial use; the credit line is required and is saved with the image."
                : provider === "wikimedia"
                  ? " — Creative Commons / public-domain files; check the licence on each (CC BY-SA means share-alike), the credit line is saved with the image. No orientation filter here."
                  : " — free to use; the credit line is saved with the image."}
              {hasLibrary ? " Picking one imports it into the library." : ""}
            </>
          ) : (
            "Photos come with a credit line that's saved alongside the image. Picking one imports it into the library."
          )}
        </div>
      </div>
    </div>
  );
}
