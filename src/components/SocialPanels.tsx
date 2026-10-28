"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch, isAuthError } from "@/components/PasscodeGate";
import { PillarTag } from "@/components/PillarTag";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/socialPlatforms";

/*
  The two database-backed panels on /admin/social:

    SocialDraftsPicker — the "From drafts" list (auto-written when a blog post
                         is published). Pick one to load it into the maker
                         (pre-fills image, platform, pillar and caption).
    SocialQueue        — what's scheduled / published through the maker,
                         with the Facebook permalink and a Cancel for
                         scheduled posts (deletes the Graph object).

  Rows show a small pillar tag (src/lib/pillars.ts) when one was recorded.
  Both tolerate a missing database by showing a one-line notice.
*/

export type SocialDraft = {
  id: string;
  blogPostId: string | null;
  blogTitle: string | null;
  blogSlug: string | null;
  platform: SocialPlatform;
  caption: string;
  imageUrl: string | null;
  status: "draft" | "scheduled" | "published" | "failed";
  /** Content pillar id (src/lib/pillars.ts) or null */
  pillarId: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  metaPostId: string | null;
  error: string | null;
  updatedAt: string;
};

const PLATFORM_CLS: Record<SocialPlatform, string> = {
  facebook: "bg-accent-soft text-accent-strong",
  instagram: "bg-berry-soft text-berry",
  linkedin: "bg-sea-soft text-sea",
  x: "bg-subtle text-ink",
};

function Platform({ p }: { p: SocialPlatform }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${PLATFORM_CLS[p]}`}>
      {PLATFORM_LABELS[p]}
    </span>
  );
}

function Status({ s }: { s: SocialDraft["status"] }) {
  const cls =
    s === "published"
      ? "bg-sea-soft text-sea"
      : s === "scheduled"
        ? "bg-sun-soft text-sun"
        : s === "failed"
          ? "bg-berry-soft text-berry"
          : "bg-subtle text-muted";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      {s}
    </span>
  );
}

export function permalinkFor(d: SocialDraft): string | null {
  if (!d.metaPostId) return null;
  if (d.platform === "facebook") return `https://www.facebook.com/${d.metaPostId}`;
  return null;
}

const CHIP = "rounded-full border-2 px-3 py-1 text-xs font-bold capitalize";
const ON = "border-accent bg-accent-soft text-accent-strong";
const OFF = "border-line text-ink hover:border-accent";

function DbNotice() {
  return (
    <p className="rounded-xl border-2 border-sun/40 bg-sun-soft/50 p-3 text-sm text-ink">
      <b>Database not connected</b> — set <code className="font-mono">DIRECT_DATABASE_URL</code> and run{" "}
      <code className="font-mono">npx prisma db push</code> to enable drafts and the queue.
      Publishing from the composer still works.
    </p>
  );
}

/* ───────────────────────── Drafts picker ───────────────────────── */

export function SocialDraftsPicker({
  passcode,
  refreshKey,
  activeId,
  onPick,
  onAuthError,
}: {
  passcode: string;
  refreshKey: number;
  activeId: string | null;
  onPick: (d: SocialDraft) => void;
  onAuthError: () => void;
}) {
  const [items, setItems] = useState<SocialDraft[]>([]);
  const [db, setDb] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"draft" | "failed" | "all">("draft");
  const [platform, setPlatform] = useState<SocialPlatform | "all">("all");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (status !== "all") q.set("status", status);
      if (platform !== "all") q.set("platform", platform);
      const d = await adminFetch<{ items: SocialDraft[]; db: boolean }>(
        passcode,
        `/api/admin/social/drafts?${q.toString()}`,
      );
      setItems(d.items || []);
      setDb(!!d.db);
      setMsg("");
    } catch (e) {
      if (isAuthError(e)) return onAuthError();
      setMsg((e as Error).message);
    }
  }, [passcode, status, platform, onAuthError]);

  useEffect(() => {

    void load();
  }, [load, refreshKey]);

  async function remove(id: string) {
    if (!window.confirm("Remove this draft? (This only forgets the row — nothing is deleted on Facebook.)")) return;
    setBusy(id);
    try {
      await adminFetch(passcode, `/api/admin/social/drafts/${id}`, { method: "DELETE", body: {} });
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="rounded-2xl border-2 border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">From drafts</h2>
        <Link href="/admin/blog/posts" className="text-xs font-bold text-accent-strong hover:underline">
          Blog posts →
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Written automatically when a blog post is published. Load one — it fills in the four steps
        above — tweak it, then publish or schedule.
      </p>

      {db === false ? (
        <div className="mt-4">
          <DbNotice />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["draft", "failed", "all"] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`${CHIP} ${status === s ? ON : OFF}`}>
                {s}
              </button>
            ))}
            <span className="mx-1 w-px bg-line" aria-hidden />
            <button onClick={() => setPlatform("all")} className={`${CHIP} ${platform === "all" ? ON : OFF}`}>
              any platform
            </button>
            {SOCIAL_PLATFORMS.map((p) => (
              <button key={p} onClick={() => setPlatform(p)} className={`${CHIP} ${platform === p ? ON : OFF}`}>
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>

          {msg && <p className="mt-3 text-sm font-semibold text-berry">{msg}</p>}

          {db === null ? (
            <p className="mt-4 text-sm text-muted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Nothing here yet. Publish a post from{" "}
              <Link href="/admin/blog/posts" className="font-semibold text-accent-strong hover:underline">
                /admin/blog/posts
              </Link>{" "}
              and four drafts appear.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {items.map((d) => (
                <li
                  key={d.id}
                  className={`rounded-xl border-2 bg-paper p-3 ${
                    activeId === d.id ? "border-accent" : "border-line"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Platform p={d.platform} />
                      <Status s={d.status} />
                      <PillarTag id={d.pillarId} />
                      {d.blogTitle && <span className="text-xs text-muted">· {d.blogTitle}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onPick(d)}
                        className="text-xs font-bold text-accent-strong hover:underline"
                      >
                        {activeId === d.id ? "Loaded" : "Load into maker"}
                      </button>
                      <button
                        onClick={() => void remove(d.id)}
                        disabled={busy === d.id}
                        className="text-xs font-bold text-muted hover:text-berry disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-ink">{d.caption}</p>
                  {d.error && <p className="mt-1 text-xs font-semibold text-berry">{d.error}</p>}
                  {(d.platform === "linkedin" || d.platform === "x") && (
                    <p className="mt-1 text-[11px] text-muted">
                      {PLATFORM_LABELS[d.platform]} isn&rsquo;t connected here — copy this text to post it there, or
                      load it to publish on Facebook.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* ───────────────────────── Queue ───────────────────────── */

export function SocialQueue({
  passcode,
  refreshKey,
  onAuthError,
  onChanged,
}: {
  passcode: string;
  refreshKey: number;
  onAuthError: () => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<SocialDraft[]>([]);
  const [db, setDb] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await adminFetch<{ items: SocialDraft[]; db: boolean }>(
        passcode,
        "/api/admin/social/queue",
      );
      setItems(d.items || []);
      setDb(!!d.db);
      setMsg("");
    } catch (e) {
      if (isAuthError(e)) return onAuthError();
      setMsg((e as Error).message);
    }
  }, [passcode, onAuthError]);

  useEffect(() => {

    void load();
  }, [load, refreshKey]);

  async function cancel(d: SocialDraft) {
    if (!window.confirm("Cancel this scheduled post? It will be deleted from Facebook and return to drafts.")) return;
    setBusy(d.id);
    setMsg("");
    try {
      await adminFetch(passcode, "/api/admin/social/queue", {
        method: "POST",
        body: { action: "cancel", draftId: d.id },
      });
      await load();
      onChanged?.();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const scheduled = items.filter((i) => i.status === "scheduled");
  const published = items.filter((i) => i.status === "published");

  function Row({ d }: { d: SocialDraft }) {
    const link = permalinkFor(d);
    const time = d.status === "scheduled" ? d.scheduledAt : d.publishedAt;
    return (
      <li className="rounded-xl border-2 border-line bg-paper p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Platform p={d.platform} />
            <Status s={d.status} />
            <PillarTag id={d.pillarId} />
            <span className="text-xs text-muted">{time ? new Date(time).toLocaleString() : ""}</span>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className="text-accent-strong hover:underline">
                Open on Facebook →
              </a>
            ) : d.metaPostId ? (
              <code className="font-mono font-normal text-muted">{d.metaPostId}</code>
            ) : null}
            {d.status === "scheduled" && (
              <button
                onClick={() => void cancel(d)}
                disabled={busy === d.id}
                className="text-muted hover:text-berry disabled:opacity-50"
              >
                {busy === d.id ? "Cancelling…" : "Cancel"}
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm text-ink">{d.caption}</p>
        {d.blogTitle && <p className="mt-1 text-[11px] text-muted">from “{d.blogTitle}”</p>}
      </li>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">Queue</h2>
        <button onClick={() => void load()} className="text-xs font-bold text-muted hover:text-ink">
          Refresh
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">
        Everything scheduled or published through the maker. Cancel removes a scheduled post from
        Facebook and puts it back in drafts.
      </p>

      {msg && <p className="mt-3 text-sm font-semibold text-berry">{msg}</p>}

      {db === false ? (
        <div className="mt-4">
          <DbNotice />
        </div>
      ) : db === null ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing scheduled or published yet.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {scheduled.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Scheduled</h3>
              <ul className="mt-2 space-y-2">
                {scheduled.map((d) => (
                  <Row key={d.id} d={d} />
                ))}
              </ul>
            </div>
          )}
          {published.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Published</h3>
              <ul className="mt-2 space-y-2">
                {published.map((d) => (
                  <Row key={d.id} d={d} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
