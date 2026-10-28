"use client";

import { useEffect, useState } from "react";
import { adminFetch, isAuthError } from "@/components/PasscodeGate";
import { setPillarsCache, usePillars } from "@/components/usePillars";
import { pillarTagCls, slugifyPillarId, type Pillar } from "@/lib/pillars";

/*
  Pillars CRUD — the block on /admin/essence that replaced the read-only
  list. Rows come from GET /api/admin/pillars?all=1 through the shared
  usePillars cache; every mutation writes the server's answer back into
  that cache so tags and chips elsewhere on the page update too.

    · reorder with ▲ ▼ (two PATCHes swapping sortOrder)
    · inline edit name / message / angles (one per line) / hashtags / target
      → Save (PATCH) per row
    · active toggle (inactive pillars disappear from pickers, old rows keep
      their tag)
    · Add pillar (POST; id auto-slugged from the name, shown so it's no
      surprise)
    · Delete (DELETE) — when posts / drafts / images still point at it the
      server answers 409 with counts and the row shows a "move them to…"
      select before confirming
*/

type Props = {
  passcode: string;
  /** null = unknown yet, false = no database (read-only), true = editable */
  db: boolean | null;
  onAuthError: () => void;
};

type Refs = { posts: number; drafts: number; images: number };

const FIELD =
  "w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:border-accent focus:outline-none disabled:opacity-60";
const LABEL = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted";
const SMALL = "rounded-full border-2 border-line px-3 py-1 text-xs font-bold text-ink hover:border-accent disabled:opacity-50";
const PRIMARY = "rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-accent-ink hover:bg-accent-strong disabled:opacity-50";

type Draft = {
  name: string;
  message: string;
  angles: string;
  hashtags: string;
  target: string;
};

function toDraft(p: Pillar): Draft {
  return {
    name: p.name,
    message: p.message,
    angles: p.angles.join("\n"),
    hashtags: p.hashtags.join(" "),
    target: p.target === null ? "" : String(p.target),
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return a.name === b.name && a.message === b.message && a.angles === b.angles && a.hashtags === b.hashtags && a.target === b.target;
}

function PillarRow({
  p,
  index,
  count,
  ro,
  others,
  busy,
  onSave,
  onMove,
  onToggle,
  onDelete,
}: {
  p: Pillar;
  index: number;
  count: number;
  ro: boolean;
  others: Pillar[];
  busy: boolean;
  onSave: (id: string, d: Draft) => Promise<void>;
  onMove: (index: number, dir: -1 | 1) => Promise<void>;
  onToggle: (p: Pillar) => Promise<void>;
  onDelete: (id: string, reassignTo?: string | null) => Promise<Refs | null>;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(p));
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState<Refs | null>(null);
  const [reassign, setReassign] = useState<string>("");

  // When the server hands back a normalised row, adopt it.
  useEffect(() => {
    setDraft(toDraft(p));  
  }, [p]);

  const dirty = !sameDraft(draft, toDraft(p));

  async function remove() {
    if (refs) {
      await onDelete(p.id, reassign || null);
      return;
    }
    if (!window.confirm(`Delete the "${p.name}" pillar?`)) return;
    const r = await onDelete(p.id);
    if (r) setRefs(r);
  }

  return (
    <li className={`rounded-xl border-2 bg-paper p-3 ${p.active ? "border-line" : "border-dashed border-line opacity-80"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${pillarTagCls(index)}`}>{draft.name || p.name}</span>
        <code className="font-mono text-[11px] text-muted">{p.id}</code>
        {p.target !== null && <span className="text-[11px] text-muted">· {p.target}% of the mix</span>}
        {!p.active && <span className="text-[11px] font-bold uppercase tracking-wide text-muted">inactive</span>}
        <span className="flex-1" />
        {!ro && (
          <>
            <button type="button" className={SMALL} disabled={busy || index === 0} onClick={() => void onMove(index, -1)} aria-label="Move up">
              ▲
            </button>
            <button type="button" className={SMALL} disabled={busy || index === count - 1} onClick={() => void onMove(index, 1)} aria-label="Move down">
              ▼
            </button>
            <button type="button" className={SMALL} disabled={busy} onClick={() => void onToggle(p)}>
              {p.active ? "Deactivate" : "Activate"}
            </button>
          </>
        )}
        <button type="button" className={SMALL} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Close" : "Edit"}
        </button>
      </div>
      <p className="mt-2 text-sm leading-snug text-ink">{draft.message || p.message}</p>
      {!open && p.hashtags.length > 0 && <p className="mt-1 text-[11px] text-muted">{p.hashtags.join(" ")}</p>}

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div>
              <label className={LABEL}>Name</label>
              <input className={FIELD} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={ro} />
            </div>
            <div>
              <label className={LABEL}>Target % of mix</label>
              <input
                className={FIELD}
                type="number"
                min={0}
                max={100}
                placeholder="—"
                value={draft.target}
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
                disabled={ro}
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Message it carries</label>
            <textarea className={`${FIELD} min-h-[56px] resize-y`} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} disabled={ro} />
          </div>
          <div>
            <label className={LABEL}>Angles — one per line</label>
            <textarea className={`${FIELD} min-h-[110px] resize-y`} value={draft.angles} onChange={(e) => setDraft({ ...draft, angles: e.target.value })} disabled={ro} />
          </div>
          <div>
            <label className={LABEL}>Hashtags — space or comma separated</label>
            <input className={FIELD} value={draft.hashtags} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} disabled={ro} />
          </div>
          {!ro && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={PRIMARY} disabled={busy || !dirty || !draft.name.trim()} onClick={() => void onSave(p.id, draft)}>
                {busy ? "Saving…" : "Save"}
              </button>
              {dirty && (
                <button type="button" className={SMALL} onClick={() => setDraft(toDraft(p))}>
                  Revert
                </button>
              )}
              <span className="flex-1" />
              <button type="button" className={`${SMALL} hover:border-berry hover:text-berry`} disabled={busy} onClick={() => void remove()}>
                {refs ? "Confirm delete" : "Delete"}
              </button>
            </div>
          )}
          {refs && (
            <div className="rounded-xl border-2 border-sun/40 bg-sun-soft/50 p-3 text-xs text-ink">
              <p>
                <b>Still in use:</b> {refs.posts} post(s), {refs.drafts} social draft(s), {refs.images} image(s). Move them to another
                pillar (or clear them) before deleting.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select className={`${FIELD} w-auto`} value={reassign} onChange={(e) => setReassign(e.target.value)}>
                  <option value="">No pillar (clear)</option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <button type="button" className={SMALL} onClick={() => setRefs(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function PillarsEditor({ passcode, db, onAuthError }: Props) {
  const { pillars, loaded } = usePillars(passcode, { includeInactive: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMessage, setNewMessage] = useState("");

  const ro = db === false;

  function fail(e: unknown) {
    if (isAuthError(e)) return onAuthError();
    setMsg((e as Error).message || "Something went wrong.");
  }

  async function refetch() {
    const d = await adminFetch<{ pillars: Pillar[]; db: boolean }>(passcode, "/api/admin/pillars?all=1");
    setPillarsCache(d.pillars || [], !!d.db);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      await refetch();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const save = (id: string, d: Draft) =>
    run(async () => {
      await adminFetch(passcode, `/api/admin/pillars/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: {
          name: d.name,
          message: d.message,
          angles: d.angles.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
          hashtags: d.hashtags.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
          target: d.target.trim() === "" ? null : Number(d.target),
        },
      });
    });

  const move = (index: number, dir: -1 | 1) =>
    run(async () => {
      const a = pillars[index];
      const b = pillars[index + dir];
      if (!a || !b) return;
      // Give every row a distinct order first (seeded rows already have one).
      const orderA = a.sortOrder === b.sortOrder ? index : a.sortOrder;
      const orderB = a.sortOrder === b.sortOrder ? index + dir : b.sortOrder;
      await Promise.all([
        adminFetch(passcode, `/api/admin/pillars/${encodeURIComponent(a.id)}`, { method: "PATCH", body: { sortOrder: orderB } }),
        adminFetch(passcode, `/api/admin/pillars/${encodeURIComponent(b.id)}`, { method: "PATCH", body: { sortOrder: orderA } }),
      ]);
    });

  const toggle = (p: Pillar) =>
    run(async () => {
      await adminFetch(passcode, `/api/admin/pillars/${encodeURIComponent(p.id)}`, { method: "PATCH", body: { active: !p.active } });
    });

  /** Returns reference counts when the server refused (409), null when deleted. */
  async function remove(id: string, reassignTo?: string | null): Promise<Refs | null> {
    setBusy(true);
    setMsg("");
    try {
      const body: Record<string, unknown> = reassignTo === undefined ? {} : { reassignTo };
      await adminFetch(passcode, `/api/admin/pillars/${encodeURIComponent(id)}`, { method: "DELETE", body });
      await refetch();
      return null;
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 409) {
        // adminFetch drops the payload; ask once more for the counts.
        const res = await fetch(`/api/admin/pillars/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ passcode }),
        });
        const d = (await res.json().catch(() => ({}))) as { references?: Refs };
        return d.references ?? { posts: 0, drafts: 0, images: 0 };
      }
      fail(e);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    run(async () => {
      await adminFetch(passcode, "/api/admin/pillars", {
        method: "POST",
        body: { name: newName.trim(), message: newMessage.trim() },
      });
      setNewName("");
      setNewMessage("");
      setAdding(false);
    });

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-ink">Pillars</h2>
        <span className="text-xs text-muted">
          {ro
            ? "No database — showing the code defaults, read-only."
            : "The brand messages every post, draft and image carries one of. Order here is the order everywhere."}
        </span>
      </div>
      {msg && <p className="mt-2 text-sm font-semibold text-berry">{msg}</p>}

      {!loaded ? (
        <p className="mt-3 text-sm text-muted">Loading pillars…</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pillars.map((p, i) => (
            <PillarRow
              key={p.id}
              p={p}
              index={i}
              count={pillars.length}
              ro={ro}
              others={pillars.filter((o) => o.id !== p.id)}
              busy={busy}
              onSave={save}
              onMove={move}
              onToggle={toggle}
              onDelete={remove}
            />
          ))}
          {pillars.length === 0 && <li className="text-sm text-muted">No pillars yet — add one below.</li>}
        </ul>
      )}

      {!ro && (
        <div className="mt-3">
          {adding ? (
            <form
              className="rounded-xl border-2 border-accent/40 bg-accent-soft/20 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL}>Name</label>
                  <input className={FIELD} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Behind the Build" autoFocus />
                  {newName.trim() && (
                    <p className="mt-1 font-mono text-[11px] text-muted">id: {slugifyPillarId(newName) || "—"}</p>
                  )}
                </div>
                <div>
                  <label className={LABEL}>Message it carries</label>
                  <input className={FIELD} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="One line" />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="submit" className={PRIMARY} disabled={busy || !newName.trim()}>
                  {busy ? "Adding…" : "Add pillar"}
                </button>
                <button type="button" className={SMALL} onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className={SMALL} onClick={() => setAdding(true)} disabled={busy}>
              + Add pillar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
