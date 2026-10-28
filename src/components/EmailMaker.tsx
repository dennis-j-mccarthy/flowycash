"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, isAuthError, PasscodeForm, useAdminPasscode } from "@/components/PasscodeGate";
import { PillarTag } from "@/components/PillarTag";
import { usePillars } from "@/components/usePillars";
import type { PillarId } from "@/lib/pillars";

/*
  /admin/email — modeled on the Throughline workbook's Email section.

    left   the list of email drafts (name, pillar tag, source posts, status
           proposed | ready | sent, created) — click to open
    right  the Newsletter generator: pick 1–3 published posts + a pillar +
           an optional theme → POST /api/admin/email/generate → three
           subject options, a preheader and the newsletter as HTML + text,
           saved as an EmailDraft. Then: choose a subject, edit the
           preheader, a live preview (iframe srcDoc), Copy HTML / Copy text /
           Download .html / Mark ready / Mark sent.

  No sending — there is no ESP configured. The UI says so.
*/

type PostRow = { id: string; title: string; slug: string; heroImage: string | null; pillarId: string | null; publishedAt: string | null };
type Summary = {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  pillarId: string | null;
  postIds: string[];
  status: "proposed" | "ready" | "sent";
  createdAt: string;
  updatedAt: string;
};
type Draft = Summary & { html: string; text: string };

const FIELD =
  "w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:border-accent focus:outline-none";
const CHIP = "rounded-full border-2 px-3 py-1 text-xs font-bold";
const ON = "border-accent bg-accent-soft text-accent-strong";
const OFF = "border-line text-ink hover:border-accent";
const PRIMARY =
  "rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink hover:bg-accent-strong disabled:opacity-50";
const SECONDARY =
  "rounded-full border-2 border-line px-4 py-2 text-xs font-bold text-ink hover:border-accent hover:text-accent-strong disabled:opacity-50";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Swap the subject/preheader inside the rendered HTML + text (they appear verbatim). */
function swapIn(d: Draft, next: { subject?: string; preheader?: string }): Draft {
  let { html, text } = d;
  if (next.subject !== undefined && next.subject !== d.subject && d.subject) {
    html = html.split(esc(d.subject)).join(esc(next.subject));
    text = text.split(d.subject).join(next.subject);
  }
  if (next.preheader !== undefined && next.preheader !== d.preheader && d.preheader) {
    html = html.split(esc(d.preheader)).join(esc(next.preheader));
    text = text.split(d.preheader).join(next.preheader);
  }
  return { ...d, ...next, html, text };
}

function StatusTag({ s }: { s: Summary["status"] }) {
  const cls = s === "sent" ? "bg-sea-soft text-sea" : s === "ready" ? "bg-sun-soft text-sun" : "bg-subtle text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>{s}</span>;
}

export function EmailMaker() {
  const { passcode, hydrated, setPasscode, clearPasscode } = useAdminPasscode();
  const [msg, setMsg] = useState("");
  const [db, setDb] = useState<boolean | null>(null);

  // list
  const [items, setItems] = useState<Summary[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // generator inputs
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [pillarId, setPillarId] = useState<PillarId | "">("");
  const { pillars } = usePillars(passcode);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState<"" | "gen" | "save">("");

  // the open draft
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState<"" | "html" | "text">("");

  const onAuthError = useCallback(() => {
    clearPasscode();
    setMsg("Wrong passcode.");
  }, [clearPasscode]);

  // list + published posts
  useEffect(() => {
    if (!passcode) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await adminFetch<{ items: Summary[]; db: boolean }>(passcode, "/api/admin/email");
        if (cancelled) return;
        setItems(d.items || []);
        setDb(!!d.db);
      } catch (e) {
        if (isAuthError(e)) return onAuthError();
        if (!cancelled) setMsg((e as Error).message);
      }
      try {
        const d = await adminFetch<{ items: PostRow[] }>(passcode, "/api/admin/blog/posts?status=published");
        if (!cancelled) setPosts(d.items || []);
      } catch {
        // generator just shows "no published posts"
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passcode, refreshKey, onAuthError]);

  const bump = () => setRefreshKey((k) => k + 1);

  function togglePost(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]));
  }

  async function generate() {
    if (!picked.length) return;
    setBusy("gen");
    setMsg("");
    try {
      const d = await adminFetch<{ draft: Draft; subjects: string[]; preheader: string }>(passcode, "/api/admin/email/generate", {
        method: "POST",
        body: { postIds: picked, pillarId: pillarId || undefined, topic: topic.trim() || undefined },
      });
      setDraft(d.draft);
      setSubjects(d.subjects || [d.draft.subject]);
      setDirty(false);
      bump();
    } catch (e) {
      if (isAuthError(e)) return onAuthError();
      setMsg((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function open(id: string) {
    setMsg("");
    try {
      const d = await adminFetch<{ draft: Draft }>(passcode, `/api/admin/email/${id}`);
      setDraft(d.draft);
      setSubjects([d.draft.subject]);
      setDirty(false);
    } catch (e) {
      if (isAuthError(e)) return onAuthError();
      setMsg((e as Error).message);
    }
  }

  async function save(extra: Partial<Pick<Draft, "status">> = {}) {
    if (!draft) return;
    setBusy("save");
    setMsg("");
    try {
      const d = await adminFetch<{ draft: Draft }>(passcode, `/api/admin/email/${draft.id}`, {
        method: "PATCH",
        body: {
          name: draft.subject,
          subject: draft.subject,
          preheader: draft.preheader,
          html: draft.html,
          text: draft.text,
          ...extra,
        },
      });
      setDraft(d.draft);
      setDirty(false);
      bump();
    } catch (e) {
      if (isAuthError(e)) return onAuthError();
      setMsg((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this email draft?")) return;
    try {
      await adminFetch(passcode, `/api/admin/email/${id}`, { method: "DELETE", body: {} });
      if (draft?.id === id) setDraft(null);
      bump();
    } catch (e) {
      if (isAuthError(e)) return onAuthError();
      setMsg((e as Error).message);
    }
  }

  async function copy(kind: "html" | "text") {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(kind === "html" ? draft.html : draft.text);
      setCopied(kind);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setMsg("Copy failed — use Download instead.");
    }
  }

  function download() {
    if (!draft) return;
    const blob = new Blob([draft.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "newsletter"}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const titleOf = (id: string) => posts.find((p) => p.id === id)?.title ?? "(post)";

  if (!hydrated) return null;
  if (!passcode) {
    return <PasscodeForm prompt="Enter the admin passcode to open the Email maker." msg={msg} onUnlock={setPasscode} />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="rounded-2xl border-2 border-sun/40 bg-sun-soft/50 p-3 text-sm text-ink">
        No email service is connected, so nothing is sent from here. Generate, pick a subject, then <b>Copy HTML</b> or{" "}
        <b>Download .html</b> and paste it into your sender. <b>Mark sent</b> keeps the list honest.
      </div>
      {msg && <p className="mt-3 text-sm font-semibold text-berry">{msg}</p>}
      {db === false && (
        <p className="mt-3 text-sm text-muted">Database not connected — the Email maker needs <code className="font-mono">DIRECT_DATABASE_URL</code>.</p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ── left: drafts list ── */}
        <aside className="rounded-2xl border-2 border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold text-ink">Emails</h2>
            <span className="text-xs text-muted">{items.length}</span>
          </div>
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No drafts yet — generate the first one on the right.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((it) => {
                const active = draft?.id === it.id;
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => void open(it.id)}
                      className={`block w-full rounded-xl border-2 px-3 py-2.5 text-left ${
                        active ? "border-accent bg-accent-soft/50" : "border-line bg-paper hover:border-accent"
                      }`}
                    >
                      <span className="block text-sm font-semibold leading-snug text-ink">{it.name}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusTag s={it.status} />
                        <PillarTag id={it.pillarId} />
                        <span className="text-[11px] text-muted">{new Date(it.createdAt).toLocaleDateString()}</span>
                      </span>
                      {it.postIds.length > 0 && (
                        <span className="mt-1 block truncate text-[11px] text-muted">
                          from: {it.postIds.map(titleOf).join(" · ")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ── right: generator + open draft ── */}
        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border-2 border-line bg-surface p-4">
            <h2 className="text-base font-bold text-ink">Newsletter generator</h2>
            <p className="mt-0.5 text-xs text-muted">Pick 1–3 published posts, a pillar, an optional theme. The Essence sets the voice.</p>

            <div className="mt-3">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted">
                Posts <span className="font-mono normal-case">({picked.length}/3)</span>
              </span>
              {posts.length === 0 ? (
                <p className="text-sm text-muted">No published posts yet.</p>
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {posts.slice(0, 30).map((p) => {
                    const on = picked.includes(p.id);
                    const n = picked.indexOf(p.id) + 1;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => togglePost(p.id)}
                          aria-pressed={on}
                          className={`flex w-full items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left ${
                            on ? "border-accent bg-accent-soft/50" : "border-line bg-paper hover:border-accent"
                          }`}
                        >
                          {p.heroImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.heroImage} alt="" className="h-9 w-9 flex-none rounded-lg object-cover" />
                          ) : (
                            <span className="h-9 w-9 flex-none rounded-lg bg-subtle" aria-hidden />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">{p.title}</span>
                            <span className="flex items-center gap-1.5 text-[11px] text-muted">
                              <PillarTag id={p.pillarId} />
                              {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : ""}
                            </span>
                          </span>
                          {on && (
                            <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-accent font-mono text-[11px] font-bold text-accent-ink">
                              {n}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setPillarId("")} className={`${CHIP} ${pillarId === "" ? ON : OFF}`} aria-pressed={pillarId === ""}>
                Any pillar
              </button>
              {pillars.map((p) => (
                <button key={p.id} type="button" onClick={() => setPillarId(p.id)} className={`${CHIP} ${pillarId === p.id ? ON : OFF}`} aria-pressed={pillarId === p.id} title={p.message}>
                  {p.name}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input className={`${FIELD} min-w-[220px] flex-1`} placeholder="Theme / topic for this issue (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Theme" />
              <button type="button" onClick={() => void generate()} disabled={busy !== "" || !picked.length || db === false} className={PRIMARY}>
                {busy === "gen" ? "Writing…" : "✨ Generate newsletter"}
              </button>
            </div>
          </section>

          {draft && (
            <section className="rounded-2xl border-2 border-accent/40 bg-accent-soft/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                  Draft <StatusTag s={draft.status} /> <PillarTag id={draft.pillarId} />
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => void copy("html")} className={SECONDARY}>
                    {copied === "html" ? "✓ Copied" : "Copy HTML"}
                  </button>
                  <button type="button" onClick={() => void copy("text")} className={SECONDARY}>
                    {copied === "text" ? "✓ Copied" : "Copy text"}
                  </button>
                  <button type="button" onClick={download} className={SECONDARY}>
                    Download .html
                  </button>
                  <button type="button" onClick={() => void remove(draft.id)} className="rounded-full px-3 py-2 text-xs font-bold text-muted hover:text-berry">
                    Delete
                  </button>
                </div>
              </div>

              {/* subject options */}
              <div className="mt-3">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted">Subject line</span>
                {subjects.length > 1 && (
                  <div className="mb-2 flex flex-col gap-1.5">
                    {subjects.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setDraft((d) => (d ? swapIn(d, { subject: s }) : d));
                          setDirty(true);
                        }}
                        aria-pressed={draft.subject === s}
                        className={`rounded-lg border-2 px-2.5 py-1.5 text-left text-sm text-ink ${
                          draft.subject === s ? "border-accent bg-accent-soft/60" : "border-line bg-paper hover:border-accent"
                        }`}
                      >
                        {s} <span className="font-mono text-[11px] text-muted">· {s.length}</span>
                      </button>
                    ))}
                  </div>
                )}
                <input
                  className={FIELD}
                  value={draft.subject}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((d) => (d ? swapIn(d, { subject: v }) : d));
                    setDirty(true);
                  }}
                  aria-label="Subject"
                />
                <span className="mb-1.5 mt-3 block text-[11px] font-bold uppercase tracking-wide text-muted">Preheader</span>
                <input
                  className={FIELD}
                  value={draft.preheader}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((d) => (d ? swapIn(d, { preheader: v }) : d));
                    setDirty(true);
                  }}
                  aria-label="Preheader"
                />
              </div>

              {/* preview */}
              <div className="mt-4 overflow-hidden rounded-xl border-2 border-line bg-paper">
                <iframe title="Newsletter preview" srcDoc={draft.html} sandbox="" className="block h-[640px] w-full bg-white" />
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-bold text-muted">Plain-text version</summary>
                <pre className="mt-2 max-h-[300px] overflow-auto whitespace-pre-wrap rounded-xl border-2 border-line bg-paper p-3 font-mono text-xs text-ink">{draft.text}</pre>
              </details>

              {/* actions */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void save()} disabled={busy !== "" || !dirty} className={PRIMARY}>
                  {busy === "save" ? "Saving…" : dirty ? "Save changes" : "Saved"}
                </button>
                {draft.status === "proposed" && (
                  <button type="button" onClick={() => void save({ status: "ready" })} disabled={busy !== ""} className={SECONDARY}>
                    Mark ready
                  </button>
                )}
                {draft.status !== "sent" ? (
                  <button type="button" onClick={() => void save({ status: "sent" })} disabled={busy !== ""} className={SECONDARY}>
                    Mark sent
                  </button>
                ) : (
                  <button type="button" onClick={() => void save({ status: "ready" })} disabled={busy !== ""} className={SECONDARY}>
                    Un-mark sent
                  </button>
                )}
                <span className="text-xs text-muted">
                  {draft.postIds.length} post{draft.postIds.length === 1 ? "" : "s"} · created {new Date(draft.createdAt).toLocaleString()}
                </span>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
