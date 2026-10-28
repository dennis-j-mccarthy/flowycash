"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  PasscodeForm,
  adminFetch,
  isAuthError,
  useAdminPasscode,
} from "@/components/PasscodeGate";
import { ImagePicker } from "@/components/ImagePicker";
import { PillarTag } from "@/components/PillarTag";
import { usePillars } from "@/components/usePillars";
import { cleanPillarId, type PillarId } from "@/lib/pillars";
import { PLATFORM_LABELS, type SocialPlatform } from "@/lib/socialPlatforms";

/*
  /admin/blog/posts — the drafts list → editor → Publish flow for BlogPost
  rows in the database. Generated drafts land here from /admin/blog; manual
  posts start with "New post". Publishing makes the post live on /blog and
  (via the publish hook) writes four social drafts for /admin/social, which
  inherit the post's pillar (edited on /admin/essence — pick it in the editor).
  The hero picker opens on the Library tab: the library dictates which images.

  Needs DIRECT_DATABASE_URL. Without it the page says so instead of failing.
*/

type Status = "draft" | "published";

type Summary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  heroImage: string | null;
  heroCredit: string | null;
  tags: string[];
  status: Status;
  source: "generated" | "manual";
  pillarId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  socialCount: number;
};

type Post = Omit<Summary, "socialCount"> & { body: string };

type Draft = {
  id: string;
  platform: SocialPlatform;
  caption: string;
  imageUrl: string | null;
  status: "draft" | "scheduled" | "published" | "failed";
  pillarId: string | null;
  metaPostId: string | null;
  scheduledAt: string | null;
};

const FIELD =
  "w-full rounded-xl border-2 border-line bg-paper px-4 py-3 text-ink placeholder:text-muted/50 focus:border-accent focus:outline-none";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted";
const BTN = "rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-50";
const PRIMARY = `${BTN} bg-accent text-accent-ink hover:bg-accent-strong`;
const SECONDARY = `${BTN} border-2 border-line text-ink hover:border-accent hover:text-accent-strong`;
const DANGER = `${BTN} border-2 border-line text-muted hover:border-berry hover:text-berry`;

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "";
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "published"
      ? "bg-sea-soft text-sea"
      : status === "scheduled"
        ? "bg-sun-soft text-sun"
        : status === "failed"
          ? "bg-berry-soft text-berry"
          : "bg-subtle text-muted";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

export function BlogPosts() {
  const { passcode, hydrated, setPasscode, clearPasscode } = useAdminPasscode();
  const { pillars } = usePillars(passcode);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [db, setDb] = useState<boolean | null>(null);
  const [items, setItems] = useState<Summary[]>([]);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [busy, setBusy] = useState("");

  // editor
  const [post, setPost] = useState<Post | null>(null);
  const [social, setSocial] = useState<Draft[]>([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [heroImage, setHeroImage] = useState("");
  const [heroCredit, setHeroCredit] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [pillarId, setPillarId] = useState<PillarId | "">("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const fail = useCallback(
    (e: unknown) => {
      if (isAuthError(e)) {
        clearPasscode();
        setMsg("Wrong passcode.");
        return;
      }
      setMsg((e as Error).message || "Something went wrong.");
    },
    [clearPasscode],
  );

  const load = useCallback(async () => {
    if (!passcode) return;
    try {
      const q = filter === "all" ? "" : `?status=${filter}`;
      const d = await adminFetch<{ items: Summary[]; db: boolean }>(
        passcode,
        `/api/admin/blog/posts${q}`,
      );
      setItems(d.items || []);
      setDb(!!d.db);
    } catch (e) {
      fail(e);
    }
  }, [passcode, filter, fail]);

  useEffect(() => {

    void load();
  }, [load]);

  const open = useCallback(
    async (id: string) => {
      setMsg("");
      setOk("");
      try {
        const d = await adminFetch<{ post: Post; social: Draft[] }>(
          passcode,
          `/api/admin/blog/posts/${id}`,
        );
        setPost(d.post);
        setSocial(d.social || []);
        setTitle(d.post.title);
        setSlug(d.post.slug);
        setExcerpt(d.post.excerpt);
        setHeroImage(d.post.heroImage ?? "");
        setHeroCredit(d.post.heroCredit ?? "");
        setTags(d.post.tags.join(", "));
        setBody(d.post.body);
        setPillarId(cleanPillarId(d.post.pillarId) ?? "");
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("id", id);
          window.history.replaceState({}, "", url);
        } catch {}
      } catch (e) {
        fail(e);
      }
    },
    [passcode, fail],
  );

  // Deep link: /admin/blog/posts?id=… (the generator sends you here).
  useEffect(() => {
    if (!passcode || post) return;
    let id = "";
    try { id = new URLSearchParams(window.location.search).get("id") || ""; } catch {}

    if (id) void open(id);
  }, [passcode, post, open]);

  function closeEditor() {
    setPost(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("id");
      window.history.replaceState({}, "", url);
    } catch {}
    void load();
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMsg("");
    setOk("");
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }

  const save = () =>
    run("save", async () => {
      if (!post) return;
      const d = await adminFetch<{ post: Post }>(passcode, `/api/admin/blog/posts/${post.id}`, {
        method: "PATCH",
        body: {
          title,
          slug,
          excerpt,
          heroImage: heroImage.trim() || null,
          heroCredit: heroCredit.trim() || null,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          body,
          pillarId: pillarId || null,
        },
      });
      setPost(d.post);
      setSlug(d.post.slug);
      setOk("Saved.");
    });

  const publish = (action: "publish" | "unpublish") =>
    run(action, async () => {
      if (!post) return;
      // Save edits first so what goes live is what's on screen.
      await adminFetch(passcode, `/api/admin/blog/posts/${post.id}`, {
        method: "PATCH",
        body: {
          title,
          slug,
          excerpt,
          heroImage: heroImage.trim() || null,
          heroCredit: heroCredit.trim() || null,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          body,
          pillarId: pillarId || null,
        },
      });
      const d = await adminFetch<{ post: Post }>(passcode, `/api/admin/blog/posts/${post.id}`, {
        method: "PATCH",
        body: { action },
      });
      setPost(d.post);
      setSlug(d.post.slug);
      setOk(
        action === "publish"
          ? "Published. Social drafts are ready below and in /admin/social."
          : "Unpublished — the post is a draft again.",
      );
    });

  const regenerate = () =>
    run("social", async () => {
      if (!post) return;
      const d = await adminFetch<{ social: Draft[] }>(passcode, `/api/admin/blog/posts/${post.id}`, {
        method: "PATCH",
        body: { action: "regenerate-social" },
      });
      setSocial(d.social || []);
      setOk("Social drafts refreshed (rows already scheduled or published were left alone).");
    });

  const remove = () =>
    run("delete", async () => {
      if (!post) return;
      if (!window.confirm(`Delete “${post.title}”? This can't be undone.`)) return;
      await adminFetch(passcode, `/api/admin/blog/posts/${post.id}`, {
        method: "DELETE",
        body: {},
      });
      closeEditor();
    });

  const createNew = () =>
    run("new", async () => {
      const d = await adminFetch<{ post: Post }>(passcode, "/api/admin/blog/posts", {
        method: "POST",
        body: { title: "Untitled post", body: "" },
      });
      await open(d.post.id);
    });

  if (!hydrated) return null;

  if (!passcode) {
    return (
      <PasscodeForm
        prompt="Enter the admin passcode to manage posts."
        msg={msg}
        onUnlock={(v) => {
          setMsg("");
          setPasscode(v);
        }}
      />
    );
  }

  if (db === false) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border-2 border-sun/40 bg-sun-soft/50 p-5 text-sm text-ink">
        <b>Database not connected.</b> Drafts, publishing and the social queue need{" "}
        <code className="font-mono">DIRECT_DATABASE_URL</code>. Provision Postgres, set the variable, run{" "}
        <code className="font-mono">npx prisma db push</code>, and redeploy. The generator at{" "}
        <Link href="/admin/blog" className="font-semibold text-accent-strong hover:underline">
          /admin/blog
        </Link>{" "}
        still works in copy-the-Markdown mode. See <code className="font-mono">docs/CONTENT_SYSTEM.md</code>.
      </div>
    );
  }

  /* ── editor ── */
  if (post) {
    const live = post.status === "published";
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={closeEditor} className="text-sm font-semibold text-muted hover:text-ink">
            ← All posts
          </button>
          <div className="flex items-center gap-2 text-sm">
            <StatusPill status={post.status} />
            {live && (
              <a
                href={`/blog/${post.slug}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent-strong hover:underline"
              >
                View on site →
              </a>
            )}
          </div>
        </div>

        {msg && <p className="text-sm font-semibold text-berry">{msg}</p>}
        {ok && <p className="text-sm font-semibold text-sea">{ok}</p>}

        <section className="space-y-4 rounded-2xl border-2 border-line bg-surface p-5">
          <div>
            <label className={LABEL}>Title</label>
            <input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Slug</label>
              <input
                className={`${FIELD} font-mono text-sm`}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">/blog/{slug || "…"}</p>
            </div>
            <div>
              <label className={LABEL}>Tags (comma-separated)</label>
              <input className={FIELD} value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={LABEL}>Excerpt</label>
            <textarea
              className={`${FIELD} min-h-[72px] resize-y`}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Pillar — the brand message it carries</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPillarId("")}
                aria-pressed={pillarId === ""}
                className={`rounded-full border-2 px-3 py-1 text-xs font-bold ${
                  pillarId === "" ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink hover:border-accent"
                }`}
              >
                None
              </button>
              {pillars.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPillarId(p.id)}
                  aria-pressed={pillarId === p.id}
                  title={p.message}
                  className={`rounded-full border-2 px-3 py-1 text-xs font-bold ${
                    pillarId === p.id ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink hover:border-accent"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              Social drafts written on publish inherit it; the post maker pre-selects it.
            </p>
          </div>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-muted">
                Hero image (URL or /assets/… path — public https for social)
              </label>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={!!busy}
                className="rounded-full border-2 border-line px-3 py-1 text-xs font-bold text-ink hover:border-accent hover:text-accent-strong disabled:opacity-50"
              >
                Choose from the Library
              </button>
            </div>
            <input
              className={FIELD}
              placeholder="/assets/article-stock/laptop-cafe.jpg"
              value={heroImage}
              onChange={(e) => setHeroImage(e.target.value)}
            />
            {heroImage.trim() && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroImage.trim()}
                alt=""
                className="mt-3 block aspect-[2/1] w-full max-w-md rounded-xl border border-line object-cover"
              />
            )}
            <input
              className={`${FIELD} mt-3 text-sm`}
              placeholder="Image credit (optional — filled in when you pick a stock photo)"
              aria-label="Hero image credit"
              value={heroCredit}
              onChange={(e) => setHeroCredit(e.target.value)}
            />
            <ImagePicker
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              passcode={passcode}
              orientation="landscape"
              suggest={{ postId: post.id, title, excerpt }}
              heading="Pick a hero image"
              initialTab="library"
              pillarId={pillarId || null}
              onPick={(p) => {
                setHeroImage(p.src.large2x);
                setHeroCredit(p.credit);
                setPickerOpen(false);
                setOk("Hero image set — Save to keep it.");
              }}
            />
          </div>
          <div>
            <label className={LABEL}>Body (Markdown)</label>
            <textarea
              className={`${FIELD} min-h-[420px] resize-y font-mono text-sm`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <button onClick={() => void save()} disabled={!!busy} className={SECONDARY}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            {live ? (
              <button onClick={() => void publish("unpublish")} disabled={!!busy} className={SECONDARY}>
                {busy === "unpublish" ? "Working…" : "Unpublish"}
              </button>
            ) : (
              <button
                onClick={() => void publish("publish")}
                disabled={!!busy || !title.trim() || !body.trim()}
                className={PRIMARY}
              >
                {busy === "publish" ? "Publishing…" : "Publish"}
              </button>
            )}
            <button onClick={() => void remove()} disabled={!!busy} className={DANGER}>
              {busy === "delete" ? "Deleting…" : "Delete"}
            </button>
          </div>
          <p className="text-xs text-muted">
            {post.source === "generated" ? "Generated draft" : "Manual post"} · created {when(post.createdAt)}
            {post.publishedAt ? ` · published ${when(post.publishedAt)}` : ""}
          </p>
        </section>

        <section className="rounded-2xl border-2 border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">Social drafts</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => void regenerate()} disabled={!!busy} className={SECONDARY}>
                {busy === "social" ? "Writing…" : social.length ? "Regenerate" : "Generate now"}
              </button>
              <Link href="/admin/social" className={`${SECONDARY} inline-block`}>
                Open post maker →
              </Link>
            </div>
          </div>
          <p className="mt-1 text-sm text-muted">
            Written automatically when the post is published — one per platform. Review and send
            them from the composer; nothing posts on its own.
          </p>
          {social.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              {live ? "No drafts yet — they appear shortly after publishing." : "Publish the post to generate drafts."}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {social.map((d) => (
                <li key={d.id} className="rounded-xl border-2 border-line bg-paper p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <b className="text-ink">{PLATFORM_LABELS[d.platform]}</b>
                      <StatusPill status={d.status} />
                      <PillarTag id={d.pillarId} />
                    </div>
                    <Link
                      href={`/admin/social?draft=${d.id}`}
                      className="text-xs font-bold text-accent-strong hover:underline"
                    >
                      Load in post maker →
                    </Link>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-ink">{d.caption}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  /* ── list ── */
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {msg && <p className="text-sm font-semibold text-berry">{msg}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "draft", "published"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold capitalize ${
                filter === f
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-line text-ink hover:border-accent"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Link href="/admin/blog" className={SECONDARY}>
            Generate with AI →
          </Link>
          <button onClick={() => void createNew()} disabled={!!busy} className={PRIMARY}>
            {busy === "new" ? "Creating…" : "New post"}
          </button>
        </div>
      </div>

      {db === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border-2 border-line bg-surface p-5 text-sm text-muted">
          No posts in the database yet. Generate one at{" "}
          <Link href="/admin/blog" className="font-semibold text-accent-strong hover:underline">
            /admin/blog
          </Link>{" "}
          or start a blank one.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => void open(p.id)}
                className="w-full rounded-2xl border-2 border-line bg-surface p-4 text-left hover:border-accent"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{p.title}</span>
                    <PillarTag id={p.pillarId} />
                  </span>
                  <span className="flex items-center gap-2">
                    {p.socialCount > 0 && (
                      <span className="text-[11px] font-bold text-muted">{p.socialCount} social</span>
                    )}
                    <StatusPill status={p.status} />
                  </span>
                </div>
                {p.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.excerpt}</p>}
                <p className="mt-2 text-xs text-muted">
                  /blog/{p.slug} · updated {when(p.updatedAt)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
