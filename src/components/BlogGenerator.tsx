"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ImagePicker } from "@/components/ImagePicker";
import { PillarTag } from "@/components/PillarTag";
import { usePillars } from "@/components/usePillars";
import { pillarIn, type PillarId } from "@/lib/pillars";

/*
  Admin blog generator — generate title ideas by pillar, then write the
  full post from a chosen title. Passcode-gated (localStorage
  "flowycash-admin-pass"). The voice (Essence + dials + tone brief) lives on
  /admin/essence and is read server-side by every route.

  Title generator (step 2) is modeled on the Throughline workbook's: pick a
  pillar (or any), set how many (1–10), Generate, then "Write this →" on any
  row. The pillar rides along to /api/admin/blog/titles (biases the angles)
  and /api/admin/blog/write (recorded on the saved BlogPost, so its social
  drafts inherit it).

  Draft: with a database the finished post is saved as a BlogPost draft and
  this panel links to /admin/blog/posts to edit + publish. Without one, the
  ready-to-paste Markdown + frontmatter for content/blog/<slug>.md is still
  here — the operator commits it, as before.
*/

type Draft = {
  title: string;
  excerpt: string;
  body: string;
  slug: string;
  markdown: string;
  id?: string;
  saved?: boolean;
  saveError?: string;
  pillarId?: string | null;
};

const FIELD =
  "w-full rounded-xl border-2 border-line bg-paper px-4 py-3 text-ink placeholder:text-muted/50 focus:border-accent focus:outline-none";
const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted";

export function BlogGenerator() {
  const [passcode, setPasscode] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [pillarId, setPillarId] = useState<PillarId | "">("");
  const { pillars } = usePillars(passcode);

  const [titles, setTitles] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editBody, setEditBody] = useState("");
  const [busy, setBusy] = useState<"" | "titles" | "write">("");
  const [writing, setWriting] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  // hero image for the saved draft (step 3)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hero, setHero] = useState<{ url: string; credit: string } | null>(null);
  const [heroBusy, setHeroBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("flowycash-admin-pass") || "";

    setPasscode(saved);
  }, []);

  const call = useCallback(
    async (path: string, payload: Record<string, unknown>) => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          passcode: passcode || localStorage.getItem("flowycash-admin-pass") || "",
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      return data;
    },
    [passcode],
  );

  async function generateTitles() {
    setBusy("titles");
    setMsg("");
    setTitles([]);
    setDraft(null);
    try {
      const d = await call("/api/admin/blog/titles", {
        topic,
        count,
        pillarId: pillarId || undefined,
      });
      setTitles((d.titles as string[]) || []);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function writePost(title: string) {
    setBusy("write");
    setWriting(title);
    setMsg("");
    setDraft(null);
    setHero(null);
    try {
      const d = await call("/api/admin/blog/write", { title, pillarId: pillarId || undefined });
      const dr = d.draft as Draft;
      setDraft(dr);
      setEditBody(dr.markdown);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy("");
      setWriting("");
    }
  }

  /** Save the chosen stock photo onto the draft row (heroImage + heroCredit). */
  async function setHeroImage(id: string, url: string, credit: string) {
    setHeroBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/blog/posts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          passcode: passcode || localStorage.getItem("flowycash-admin-pass") || "",
          heroImage: url,
          heroCredit: credit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setHero({ url, credit });
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setHeroBusy(false);
    }
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(editBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMsg("Copy failed — select the text manually.");
    }
  }

  /* ── passcode gate ── */
  if (!passcode) {
    return (
      <form
        className="mx-auto max-w-sm text-center"
        onSubmit={(e) => {
          e.preventDefault();
          const v = ((new FormData(e.currentTarget).get("pass") as string) || "").trim();
          if (!v) return;
          try { localStorage.setItem("flowycash-admin-pass", v); } catch {}
          setPasscode(v);
        }}
      >
        <p className="text-muted">Enter the admin passcode to open the generator.</p>
        {msg && <p className="mt-2 text-sm font-semibold text-berry">{msg}</p>}
        <input
          name="pass"
          type="password"
          autoComplete="current-password"
          placeholder="Passcode"
          aria-label="Admin passcode"
          className="mt-4 w-full rounded-xl border-2 border-line bg-paper px-4 py-3 text-center text-ink focus:border-accent focus:outline-none"
        />
        <button className="mt-3 w-full rounded-xl bg-accent px-6 py-3 font-bold text-accent-ink hover:bg-accent-strong">
          Unlock
        </button>
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {msg && <p className="text-sm font-semibold text-berry">{msg}</p>}

      {/* ── voice pointer ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-line bg-surface px-5 py-3 text-sm text-muted">
        <span>Voice, tone and the brand essence are set once on the Essence page — every title and post below reads them.</span>
        <Link href="/admin/essence" className="font-bold text-accent-strong hover:underline">
          Edit the Essence →
        </Link>
      </div>

      {/* ── Step 1: Title generator (by pillar) ── */}
      <section className="rounded-2xl border-2 border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-bold text-ink">1 · Title generator</h2>
          <span className="text-xs text-muted">
            Spin up post title ideas by pillar, then write any one on the spot.
          </span>
        </div>

        <div className="mt-3">
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
              Any pillar
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
          {pillarId && (
            <p className="mt-2 text-xs text-muted">{pillarIn(pillars, pillarId)?.message}</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className={LABEL}>Topic (optional)</label>
            <input
              className={FIELD}
              placeholder="e.g. why custom beats a template"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>How many</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                className="h-11 w-11 rounded-xl border-2 border-line text-xl font-bold text-ink hover:border-accent"
                aria-label="Fewer titles"
              >
                −
              </button>
              <span className="w-8 text-center text-lg font-bold text-ink">{count}</span>
              <button
                onClick={() => setCount((c) => Math.min(10, c + 1))}
                className="h-11 w-11 rounded-xl border-2 border-line text-xl font-bold text-ink hover:border-accent"
                aria-label="More titles"
              >
                +
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void generateTitles()}
            disabled={busy !== ""}
            className="rounded-full bg-accent px-6 py-3 font-bold text-accent-ink hover:bg-accent-strong disabled:opacity-50"
          >
            {busy === "titles" ? "Thinking…" : `Generate ${count} →`}
          </button>
          {titles.length > 0 && (
            <button
              onClick={() => setTitles([])}
              disabled={busy !== ""}
              className="rounded-full border-2 border-line px-4 py-2 text-xs font-bold text-muted hover:border-berry hover:text-berry disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>

        {titles.length > 0 && (
          <ul className="mt-5 space-y-2">
            {titles.map((t, i) => (
              <li
                key={`${i}:${t}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-line bg-paper px-4 py-3"
              >
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{t}</span>
                  <PillarTag id={pillarId || null} />
                </span>
                <span className="flex flex-none items-center gap-1.5">
                  <button
                    onClick={() => void writePost(t)}
                    disabled={busy !== ""}
                    className="rounded-full border-2 border-line px-4 py-1.5 text-xs font-bold text-ink hover:border-accent hover:text-accent-strong disabled:opacity-50"
                  >
                    {busy === "write" && writing === t ? "Writing…" : "Write this →"}
                  </button>
                  <button
                    onClick={() => setTitles((ts) => ts.filter((_, j) => j !== i))}
                    disabled={busy !== ""}
                    title="Discard"
                    aria-label={`Discard "${t}"`}
                    className="rounded-full px-2 py-1.5 text-xs font-bold text-muted hover:text-berry disabled:opacity-50"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Step 2: Draft ── */}
      {draft && (
        <section className="rounded-2xl border-2 border-accent/40 bg-accent-soft/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              2 · Draft <PillarTag id={draft.pillarId} />
            </h2>
            <button
              onClick={() => void copyMarkdown()}
              className="rounded-full bg-ink px-4 py-2 text-xs font-bold text-paper hover:opacity-90"
            >
              {copied ? "✓ Copied" : "Copy Markdown"}
            </button>
          </div>
          {draft.saved && draft.id ? (
            <div className="mt-3 rounded-xl border-2 border-sea/40 bg-sea-soft/40 p-3 text-sm text-ink">
              Saved as a draft.{" "}
              <Link
                href={`/admin/blog/posts?id=${draft.id}`}
                className="font-bold text-accent-strong hover:underline"
              >
                Edit &amp; publish →
              </Link>{" "}
              <span className="text-muted">
                (publishing also writes the Facebook / Instagram / LinkedIn / X drafts)
              </span>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {hero && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hero.url}
                    alt=""
                    className="block aspect-[2/1] w-40 rounded-lg border border-line object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    disabled={heroBusy}
                    className="rounded-full border-2 border-line bg-paper px-4 py-1.5 text-xs font-bold text-ink hover:border-accent hover:text-accent-strong disabled:opacity-50"
                  >
                    {heroBusy ? "Saving…" : hero ? "Change hero image" : "Choose a hero image"}
                  </button>
                  {hero && <p className="mt-1 truncate text-xs text-muted">{hero.credit}</p>}
                </div>
              </div>
              <ImagePicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                passcode={passcode}
                orientation="landscape"
                suggest={{ postId: draft.id, title: draft.title, excerpt: draft.excerpt }}
                heading="Choose a hero image"
                initialTab="library"
                pillarId={draft.pillarId ?? pillarId ?? null}
                onPick={(p) => {
                  setPickerOpen(false);
                  if (draft.id) void setHeroImage(draft.id, p.src.large2x, p.credit);
                }}
              />
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">
              {draft.saveError ? (
                <span className="font-semibold text-berry">Couldn&rsquo;t save to the database: {draft.saveError}. </span>
              ) : null}
              The draft wasn&rsquo;t stored. Edit here and copy the Markdown
              (slug <code className="font-mono">{draft.slug}</code>), then try again once the
              database is connected.
            </p>
          )}
          <p className="mt-3 text-sm text-ink">
            <b>Excerpt:</b> {draft.excerpt}
          </p>
          <textarea
            className={`${FIELD} mt-3 min-h-[380px] resize-y font-mono text-sm`}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            spellCheck={false}
          />
        </section>
      )}
    </div>
  );
}
