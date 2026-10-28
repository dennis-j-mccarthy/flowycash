"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, isAuthError } from "@/components/PasscodeGate";
import Link from "next/link";
import { ImagePicker, type LibraryItem } from "@/components/ImagePicker";
import { PostPreview, previewValidity } from "@/components/PostPreview";
import type { SocialDraft } from "@/components/SocialPanels";
import { usePillars } from "@/components/usePillars";
import { cleanPillarId, pillarIn, pillarTagClsFor, type PillarId } from "@/lib/pillars";
import {
  CAPTION_LIMITS,
  PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  isSocialPlatform,
  type SocialPlatform,
} from "@/lib/socialPlatforms";

/*
  Post maker — the top of /admin/social. Modeled on the Throughline workbook's
  post builder: four numbered steps in a left→right row (they stack on a
  phone), each a card that turns "done" (green badge) once it has a value.

    ① Choose an image    THE LIBRARY (GET /api/admin/images), newest first,
                         filtered to the chosen pillar when one is set (all
                         when that pillar has no images yet); "Open Library"
                         links to /admin/library; "Search / upload" opens the
                         ImagePicker on Search, which imports the pick into
                         the library; a URL can also be pasted.
                         /admin/social?imageId=<id> pre-selects a library item.
    ② Choose platform    Facebook / Instagram / LinkedIn / X. FB + IG publish
                         through Meta (with an "also Instagram" companion on
                         FB); LinkedIn and X are copy-only and say so.
    ③ Choose pillar      the brand message it carries (GET /api/admin/pillars
                         via usePillars; edited on /admin/essence).
    ④ Choose caption     "Generate 3 options" → /api/admin/social/captions →
                         selectable cards, an editable textarea with a
                         per-platform character counter.
    Preview              once image + platform + caption exist, PostPreview
                         mimics the network; Publish now / Schedule (or Copy)
                         live INSIDE that card and stay disabled until the
                         preview is valid — you see it before you send it.

  Publishing goes through the existing /api/admin/fbpost `post` action with
  draftId (when a draft is loaded) and pillarId, so the queue row records
  the pillar. Loading a "From drafts" row pre-fills all four steps.
*/

type Config = {
  connected: boolean;
  instagram: boolean;
  page: string | null;
  igUsername: string | null;
};

type PostResult = {
  target: "facebook" | "instagram";
  ok: boolean;
  id?: string;
  scheduled?: boolean;
  scheduledAt?: string | null;
  error?: string;
};

type Props = {
  passcode: string;
  cfg: Config | null;
  /** A "From drafts" row loaded into the maker (pre-fills steps 1–4). */
  draft: SocialDraft | null;
  onDetach: () => void;
  /** Called after any publish attempt so the panels below refresh. */
  onPosted: () => void;
  onAuthError: () => void;
};

const FIELD =
  "w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:border-accent focus:outline-none";
const CHIP = "rounded-full border-2 px-3 py-1 text-xs font-bold";
const ON = "border-accent bg-accent-soft text-accent-strong";
const OFF = "border-line text-ink hover:border-accent";
const PRIMARY =
  "rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink hover:bg-accent-strong disabled:opacity-50";
const SECONDARY =
  "rounded-full border-2 border-line px-5 py-2.5 text-sm font-bold text-ink hover:border-accent hover:text-accent-strong disabled:opacity-50";

/* ── one step card (.pstep) ── */
function Step({
  n,
  title,
  hint,
  done,
  children,
  aside,
}: {
  n: number;
  title: string;
  hint: string;
  done: boolean;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border-2 border-line bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`grid h-[23px] w-[23px] place-items-center rounded-full font-mono text-xs font-bold ${
            done ? "bg-sea text-white" : "bg-accent-soft text-accent"
          }`}
          aria-label={done ? `Step ${n}, done` : `Step ${n}`}
        >
          {n}
        </span>
        {aside}
      </div>
      <h3 className="mb-0.5 mt-2 text-[13.5px] font-semibold text-ink">{title}</h3>
      <p className="mb-2.5 text-[11px] leading-snug text-muted">{hint}</p>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** True when the URL carries an explicit pillar (the Creator page handoff) — it wins over the image's own pillar. */
function hasUrlPillar(): boolean {
  try {
    return !!cleanPillarId(new URLSearchParams(window.location.search).get("pillar"));
  } catch {
    return false;
  }
}

export function PostMaker({ passcode, cfg, draft, onDetach, onPosted, onAuthError }: Props) {
  // step 1
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [thumbs, setThumbs] = useState<LibraryItem[]>([]);
  const [thumbsLoaded, setThumbsLoaded] = useState(false);
  const [thumbsNote, setThumbsNote] = useState("");
  const [libKey, setLibKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  // step 2
  const [platform, setPlatform] = useState<SocialPlatform>("facebook");
  const [alsoIg, setAlsoIg] = useState(false);
  // step 3
  const [pillarId, setPillarId] = useState<PillarId | null>(null);
  const { pillars } = usePillars(passcode);
  // step 4
  const [topic, setTopic] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState<"" | "captions" | "post">("");
  const [msg, setMsg] = useState("");
  const [results, setResults] = useState<PostResult[]>([]);
  const [copied, setCopied] = useState(false);

  const connected = !!cfg?.connected;
  const igLinked = !!cfg?.instagram;
  const metaPlatform = platform === "facebook" || platform === "instagram";
  const limit = CAPTION_LIMITS[platform];
  const over = caption.length > limit;
  const { valid: previewValid } = previewValidity(platform, caption, imageUrl);
  const showPreview = !!caption.trim();

  /* ── step 1: thumbnails = the Library (by pillar when one is chosen) ── */
  useEffect(() => {
    if (!passcode) return;
    let cancelled = false;
    (async () => {
      const list = async (pid: string | null) => {
        const sp = new URLSearchParams({ limit: "24" });
        if (pid) sp.set("pillarId", pid);
        const d = await adminFetch<{ images: LibraryItem[] }>(passcode, `/api/admin/images?${sp}`);
        return d.images || [];
      };
      let out: LibraryItem[] = [];
      let note = "";
      try {
        out = await list(pillarId);
        if (pillarId && out.length === 0) {
          out = await list(null);
          if (out.length) note = "No library images tagged with this pillar yet — showing all.";
        }
      } catch (e) {
        if (isAuthError(e)) return onAuthError();
        // the grid is a convenience; the picker still works
      }
      if (cancelled) return;
      setThumbs(out);
      setThumbsNote(note);
      setThumbsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [passcode, pillarId, libKey, onAuthError]);

  /* ── ?imageId= (from the Library's "Use in Post maker →") pre-selects ── */
  useEffect(() => {
    if (!passcode) return;
    let id = "";
    try {
      id = new URLSearchParams(window.location.search).get("imageId") || "";
    } catch {
      return;
    }
    if (!id) return;
    let cancelled = false;
    adminFetch<{ image: LibraryItem }>(passcode, `/api/admin/images/${encodeURIComponent(id)}`)
      .then((d) => {
        if (cancelled || !d.image) return;
        setImageUrl(d.image.url);
        setImageAlt(d.image.title);
        if (d.image.pillarId && !hasUrlPillar()) setPillarId(d.image.pillarId);
      })
      .catch(() => {
        // a stale link; the grid still works
      });
    return () => {
      cancelled = true;
    };
  }, [passcode]);

  /* ── ?caption=&platform=&pillar=&at= — the Creator page's "Send to Meta" hands a whole post over.
        (imageId above picks the image; this fills the rest. Date is local "YYYY-MM-DDTHH:MM".) ── */
  useEffect(() => {
    let sp: URLSearchParams;
    try {
      sp = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const cap = sp.get("caption");
    const pf = sp.get("platform");
    const pid = cleanPillarId(sp.get("pillar"));
    const at = sp.get("at");
    if (!cap && !pf && !pid && !at) return;
    queueMicrotask(() => {
      if (cap) setCaption(cap.slice(0, 5000));
      if (pf && isSocialPlatform(pf)) setPlatform(pf);
      if (pid) setPillarId(pid as PillarId);
      if (at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)) setScheduledAt(at.slice(0, 16));
    });
  }, []);

  /* ── a loaded draft pre-fills every step ── */
  useEffect(() => {
    if (!draft) return;

    setImageUrl(draft.imageUrl ?? "");
    setImageAlt(draft.blogTitle ?? "");
    setPlatform(draft.platform);
    setAlsoIg(false);
    setPillarId(cleanPillarId(draft.pillarId));
    setCaption(draft.caption);
    setOptions([]);
    setResults([]);
    setMsg("");

  }, [draft]);

  const choosePlatform = useCallback((p: SocialPlatform) => {
    setPlatform(p);
    if (p !== "facebook") setAlsoIg(false);
    setOptions([]); // options were written for the previous platform
  }, []);

  /* ── step 4: captions ── */
  async function generate() {
    if (!pillarId) {
      setMsg("Choose a pillar first (step 3).");
      return;
    }
    setBusy("captions");
    setMsg("");
    // Voice comes from the Essence (/admin/essence) server-side.
    try {
      const d = await adminFetch<{ captions: string[] }>(passcode, "/api/admin/social/captions", {
        method: "POST",
        body: {
          pillarId,
          platform,
          imageAlt: imageAlt || undefined,
          blogPostId: draft?.blogPostId ?? undefined,
          topic: topic.trim() || undefined,
        },
      });
      const caps = d.captions || [];
      setOptions(caps);
      if (caps[0] && !caption.trim()) setCaption(caps[0]);
    } catch (e) {
      if (isAuthError(e)) return onAuthError();
      setMsg((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function submit(schedule: boolean) {
    if (!caption.trim() || !metaPlatform || !previewValid) return;
    setBusy("post");
    setMsg("");
    setResults([]);
    try {
      const targets: ("facebook" | "instagram")[] =
        platform === "instagram" ? ["instagram"] : alsoIg && igLinked ? ["facebook", "instagram"] : ["facebook"];
      // datetime-local has no timezone; send an absolute instant.
      const iso = schedule && scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
      const res = await fetch("/api/admin/fbpost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          passcode,
          action: "post",
          caption,
          imageUrl: imageUrl.trim() || undefined,
          scheduledAt: iso,
          targets,
          draftId: draft?.id,
          pillarId: pillarId ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return onAuthError();
      if (!res.ok && !data.results) throw new Error(data.error || `Failed (${res.status})`);
      const rs = (data.results as PostResult[]) || [];
      setResults(rs);
      if (rs.length && rs.every((r) => r.ok)) {
        setCaption("");
        setOptions([]);
        setImageUrl("");
        setImageAlt("");
        setScheduledAt("");
        setTopic("");
        onDetach();
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy("");
      onPosted();
    }
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMsg("Copy failed — select the text manually.");
    }
  }

  const pillar = pillarIn(pillars, pillarId);

  return (
    <div>
      {draft && (
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-accent/40 bg-accent-soft/40 px-4 py-2.5 text-sm text-ink">
          <span>
            Loaded <b>{PLATFORM_LABELS[draft.platform]}</b> draft
            {draft.blogTitle ? <> from &ldquo;{draft.blogTitle}&rdquo;</> : null}
            {" — "}the result will be recorded on it.
          </span>
          <button onClick={onDetach} className="text-xs font-bold text-muted hover:text-ink">
            Detach
          </button>
        </div>
      )}

      {/* ── the four steps (.pseq) ── */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* ① image */}
        <Step
          n={1}
          title="Choose an image"
          hint={
            imageUrl
              ? "Chosen — tap another to swap, or ✕ to clear."
              : pillar
                ? `From the Library — ${pillar.name} first.`
                : "From the Library. Choose a pillar to narrow it."
          }
          done={!!imageUrl.trim()}
          aside={
            imageUrl ? (
              <button
                type="button"
                onClick={() => {
                  setImageUrl("");
                  setImageAlt("");
                }}
                className="text-xs font-bold text-muted hover:text-berry"
                aria-label="Clear image"
              >
                ✕
              </button>
            ) : null
          }
        >
          {imageUrl.trim() && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl.trim()}
              alt=""
              className="mb-2 block aspect-square w-full rounded-lg border border-line object-cover"
            />
          )}
          {thumbs.length > 0 ? (
            <ul className="grid max-h-[220px] grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-3">
              {thumbs.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    title={`${t.title}${t.collection ? ` · ${t.collection}` : ""}`}
                    onClick={() => {
                      setImageUrl(t.url);
                      setImageAlt(t.title);
                    }}
                    className={`block aspect-square w-full overflow-hidden rounded-lg border-2 ${
                      imageUrl === t.url ? "border-accent" : "border-line hover:border-accent"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.url} alt={t.title} loading="lazy" className="block h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">
              {thumbsLoaded ? "No images in the library yet — upload or import one." : "Loading the library…"}
            </p>
          )}
          {thumbsNote && <p className="mt-1.5 text-[11px] text-muted">{thumbsNote}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Link href="/admin/library" className={`${CHIP} ${OFF}`}>
              Open Library
            </Link>
            <button type="button" onClick={() => setPickerOpen(true)} className={`${CHIP} ${OFF}`}>
              Search / upload
            </button>
            <button type="button" onClick={() => setUrlOpen((v) => !v)} className="text-[11px] font-bold text-muted hover:text-ink">
              {urlOpen ? "Hide URL" : "Paste a URL"}
            </button>
          </div>
          {urlOpen && (
            <input
              className={`${FIELD} mt-2`}
              placeholder="https://… (public JPEG)"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                setImageAlt("");
              }}
              aria-label="Image URL"
            />
          )}
          <ImagePicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            passcode={passcode}
            orientation="square"
            suggest={
              draft
                ? { postId: draft.blogPostId ?? undefined, title: draft.blogTitle ?? undefined }
                : pillar
                  ? { title: pillar.message }
                  : undefined
            }
            heading="Pick a photo for the post"
            initialTab="search"
            pillarId={pillarId}
            onPick={(p) => {
              setImageUrl(p.src.large);
              setImageAlt(p.alt || "");
              setPickerOpen(false);
              setLibKey((k) => k + 1); // the pick is a library item now
            }}
          />
        </Step>

        {/* ② platform */}
        <Step
          n={2}
          title="Choose platform"
          hint={
            metaPlatform
              ? `${PLATFORM_LABELS[platform]} publishes through Meta · ${limit.toLocaleString()} characters`
              : `${PLATFORM_LABELS[platform]} isn't connected — copy the text and post it there · ${limit.toLocaleString()} characters`
          }
          done={!!platform}
        >
          <div className="flex flex-wrap gap-1.5">
            {SOCIAL_PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => choosePlatform(p)}
                className={`${CHIP} ${platform === p ? ON : OFF}`}
                aria-pressed={platform === p}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] leading-snug text-muted">
            Facebook + Instagram publish via Meta. LinkedIn and X are copy-only.
          </p>
          {platform === "facebook" && (
            <label
              className={`mt-2.5 flex items-center gap-2 text-xs font-semibold ${igLinked ? "text-ink" : "text-muted/60"}`}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-accent"
                checked={alsoIg && igLinked}
                onChange={(e) => setAlsoIg(e.target.checked)}
                disabled={!igLinked}
              />
              Also post to Instagram{!igLinked && " (not linked)"}
            </label>
          )}
          {platform === "instagram" && (
            <p className="mt-2.5 text-[11px] leading-snug text-muted">
              {igLinked
                ? "Needs an image; Instagram can't schedule."
                : "No Instagram account is linked on this Page — publish to Facebook instead."}
            </p>
          )}
        </Step>

        {/* ③ pillar */}
        <Step n={3} title="Choose pillar" hint="The brand message it carries" done={!!pillarId}>
          <div className="flex flex-col gap-1.5">
            {pillars.length === 0 && <p className="text-xs text-muted">Loading pillars…</p>}
            {pillars.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPillarId(p.id);
                  setOptions([]);
                }}
                aria-pressed={pillarId === p.id}
                className={`rounded-lg border-2 px-2.5 py-1.5 text-left ${
                  pillarId === p.id ? "border-accent bg-accent-soft/60" : "border-line bg-paper hover:border-accent"
                }`}
              >
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${pillarTagClsFor(pillars, p.id)}`}>
                  {p.name}
                </span>
                {pillarId === p.id && (
                  <span className="mt-1 block text-[11px] leading-snug text-ink">{p.message}</span>
                )}
              </button>
            ))}
          </div>
        </Step>

        {/* ④ caption */}
        <Step
          n={4}
          title="Choose caption"
          hint={options.length ? "Tap one, or edit below." : "Generate three in the brand voice, or write your own."}
          done={!!caption.trim()}
          aside={
            <button
              type="button"
              onClick={() => void generate()}
              disabled={busy !== "" || !pillarId}
              title={pillarId ? `Write 3 ${PLATFORM_LABELS[platform]} options for "${pillar?.name}"` : "Choose a pillar first"}
              className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-ink hover:bg-accent-strong disabled:opacity-50"
            >
              {busy === "captions" ? "Writing…" : "✨ Generate 3 options"}
            </button>
          }
        >
          <input
            className={`${FIELD} mb-2`}
            placeholder="What's it about? (optional nudge)"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            aria-label="Topic"
          />
          {options.length > 0 && (
            <div className="mb-2 flex max-h-[180px] flex-col gap-1.5 overflow-y-auto">
              {options.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCaption(o)}
                  aria-pressed={caption === o}
                  className={`rounded-lg border-2 px-2.5 py-1.5 text-left text-xs leading-snug text-ink ${
                    caption === o ? "border-accent bg-accent-soft/60" : "border-line bg-paper hover:border-accent"
                  }`}
                >
                  <span className="line-clamp-4 whitespace-pre-line">{o}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            className={`${FIELD} min-h-[120px] resize-y`}
            placeholder="Write the post…"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            disabled={busy === "post"}
          />
          <p className={`mt-1 text-right font-mono text-[11px] ${over ? "font-bold text-berry" : "text-muted"}`}>
            {caption.length.toLocaleString()} / {limit.toLocaleString()}
            {over && " — too long for " + PLATFORM_LABELS[platform]}
          </p>
        </Step>
      </div>

      {msg && <p className="mt-3 text-sm font-semibold text-berry">{msg}</p>}

      {/* ── preview (the publish / schedule / copy controls live inside it) ── */}
      <div className="mt-4">
        {showPreview ? (
          <PostPreview
            platform={platform}
            caption={caption}
            imageUrl={imageUrl}
            scheduledAt={metaPlatform && platform !== "instagram" ? scheduledAt : ""}
            actions={
              metaPlatform ? (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1">
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
                      Schedule (optional — leave blank to post now)
                    </label>
                    <input
                      className={`${FIELD} max-w-[280px]`}
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      disabled={!connected || busy !== "" || platform === "instagram"}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void submit(false)}
                      disabled={!connected || busy !== "" || !previewValid || (platform === "instagram" && !igLinked)}
                      className={PRIMARY}
                    >
                      {busy === "post" ? "Working…" : "Publish now"}
                    </button>
                    <button
                      onClick={() => void submit(true)}
                      disabled={!connected || busy !== "" || !previewValid || !scheduledAt || platform === "instagram"}
                      className={SECONDARY}
                    >
                      Schedule
                    </button>
                  </div>
                  {!connected && (
                    <p className="w-full text-xs text-muted">
                      Publishing is off until Meta is connected (see the notice above). You can still draft and copy.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="min-w-[200px] flex-1 text-sm text-muted">
                    {PLATFORM_LABELS[platform]} isn&rsquo;t connected here. Copy the caption and post it there, or switch to
                    Facebook to publish through Meta.
                  </p>
                  <button onClick={() => void copyCaption()} disabled={!previewValid} className={PRIMARY}>
                    {copied ? "✓ Copied" : "Copy caption"}
                  </button>
                </div>
              )
            }
          />
        ) : (
          <div className="rounded-xl border-2 border-dashed border-line bg-surface p-4 text-center text-sm text-muted">
            Finish the four steps — the preview appears here, with Publish / Schedule inside it.
          </div>
        )}
      </div>

      {/* ── results ── */}
      {results.length > 0 && (
        <div className="mt-4 space-y-2">
          {results.map((r) => (
            <div
              key={r.target}
              className={`rounded-xl border-2 p-3 text-sm ${
                r.ok ? "border-sea/40 bg-sea-soft/40 text-ink" : "border-berry/40 bg-berry-soft text-berry"
              }`}
            >
              <b className="capitalize">{r.target}</b>:{" "}
              {r.ok ? (
                <>
                  {r.scheduled ? "scheduled" : "published"}
                  {" · "}
                  <code className="font-mono text-xs">{r.id}</code>
                  {r.scheduledAt ? ` · ${new Date(r.scheduledAt).toLocaleString()}` : ""}
                </>
              ) : (
                r.error
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
