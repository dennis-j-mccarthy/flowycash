"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ImagePicker } from "@/components/ImagePicker";
import { PasscodeForm, adminFetch, isAuthError, useAdminPasscode } from "@/components/PasscodeGate";
import { PillarTag } from "@/components/PillarTag";
import { usePillars } from "@/components/usePillars";

/*
  /admin/library — the Throughline-style image Library. Every image the
  site uses is a row here (src/lib/library.ts); the post maker and the hero
  pickers list THIS, so "the library dictates which images".

    · collection chips (All + each collection), pillar filter, search
    · Upload opens the ImagePicker on its Upload / Search tabs — both land
      in the library (uploads are rows; stock photos are imported first)
    · each card: image, title (click → edit), collection, pillar tag, tags,
      credit, source, "Use in Post maker →" (/admin/social?imageId=…), delete
    · phone-friendly grid (2 → 3 → 4 columns)

  GET /api/admin/images?collection=&pillarId=&q= does the filtering;
  PATCH /api/admin/images/[id] saves metadata; DELETE removes the row.
*/

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

type ListResponse = {
  configured: boolean;
  backend: "db" | "blob" | null;
  images: LibraryItem[];
  collections: { name: string; count: number }[];
};

const CHIP = "rounded-full border-2 px-3 py-1 text-xs font-bold";
const ON = "border-accent bg-accent-soft text-accent-strong";
const OFF = "border-line text-ink hover:border-accent";
const FIELD =
  "w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:border-accent focus:outline-none";
const SMALL = "rounded-full border-2 border-line px-3 py-1 text-xs font-bold text-ink hover:border-accent disabled:opacity-50";
const PRIMARY = "rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-accent-ink hover:bg-accent-strong disabled:opacity-50";

const SOURCE_LABEL = { upload: "Upload", stock: "Stock", workbook: "Workbook" } as const;

function Card({
  it,
  passcode,
  collections,
  onSaved,
  onDeleted,
  onError,
}: {
  it: LibraryItem;
  passcode: string;
  collections: string[];
  onSaved: (next: LibraryItem) => void;
  onDeleted: (id: string) => void;
  onError: (e: unknown) => void;
}) {
  const { pillars } = usePillars(passcode);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(it.title);
  const [collection, setCollection] = useState(it.collection ?? "");
  const [pillarId, setPillarId] = useState(it.pillarId ?? "");
  const [tags, setTags] = useState(it.tags.join(", "));
  const [credit, setCredit] = useState(it.credit ?? "");

  function open() {
    setTitle(it.title);
    setCollection(it.collection ?? "");
    setPillarId(it.pillarId ?? "");
    setTags(it.tags.join(", "));
    setCredit(it.credit ?? "");
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    try {
      const d = await adminFetch<{ image: LibraryItem }>(passcode, `/api/admin/images/${encodeURIComponent(it.id)}`, {
        method: "PATCH",
        body: { title, collection: collection || null, pillarId: pillarId || null, tags, credit },
      });
      onSaved(d.image);
      setEditing(false);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${it.title}" from the library? Posts still using it will lose the image.`)) return;
    setBusy(true);
    try {
      await adminFetch(passcode, `/api/admin/images/${encodeURIComponent(it.id)}`, { method: "DELETE", body: {} });
      onDeleted(it.id);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border-2 border-line bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={it.url} alt={it.title} loading="lazy" className="block aspect-square w-full bg-paper object-cover" />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {editing ? (
          <div className="space-y-2">
            <input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" placeholder="Title" autoFocus />
            <input
              className={FIELD}
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              aria-label="Collection"
              placeholder="Collection (e.g. gallery)"
              list={`lib-collections-${it.id}`}
            />
            <datalist id={`lib-collections-${it.id}`}>
              {collections.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <select className={FIELD} value={pillarId} onChange={(e) => setPillarId(e.target.value)} aria-label="Pillar">
              <option value="">No pillar</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input className={FIELD} value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Tags" placeholder="tags, comma, separated" />
            <input className={FIELD} value={credit} onChange={(e) => setCredit(e.target.value)} aria-label="Credit" placeholder="Credit line (optional)" />
            <div className="flex gap-2">
              <button type="button" className={PRIMARY} onClick={() => void save()} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" className={SMALL} onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button type="button" onClick={open} className="text-left text-sm font-semibold leading-snug text-ink hover:text-accent-strong" title="Rename / edit">
              {it.title}
            </button>
            <div className="flex flex-wrap items-center gap-1.5">
              {it.collection && (
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-bold text-muted">{it.collection}</span>
              )}
              <PillarTag id={it.pillarId} />
              <span className="text-[11px] text-muted">{SOURCE_LABEL[it.source] ?? it.source}</span>
            </div>
            {it.tags.length > 0 && <p className="text-[11px] text-muted">{it.tags.map((t) => `#${t}`).join(" ")}</p>}
            {it.credit && <p className="truncate text-[11px] text-muted" title={it.credit}>{it.credit}</p>}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1.5">
              <Link href={`/admin/social?imageId=${encodeURIComponent(it.id)}`} className="text-xs font-bold text-accent-strong hover:underline">
                Use in Post maker →
              </Link>
              <button type="button" onClick={() => void remove()} disabled={busy} className="text-[11px] font-bold text-muted hover:text-berry disabled:opacity-50">
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

export function Library() {
  const { passcode, hydrated, setPasscode, clearPasscode } = useAdminPasscode();
  const { pillars } = usePillars(passcode);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [collections, setCollections] = useState<{ name: string; count: number }[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [backend, setBackend] = useState<"db" | "blob" | null>(null);
  const [collection, setCollection] = useState("");
  const [pillarId, setPillarId] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [picker, setPicker] = useState<"" | "upload" | "search">("");

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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (!passcode) return;
    setLoading(true);
    try {
      const sp = new URLSearchParams({ limit: "200" });
      if (collection) sp.set("collection", collection);
      if (pillarId) sp.set("pillarId", pillarId);
      if (debouncedQ) sp.set("q", debouncedQ);
      const d = await adminFetch<ListResponse>(passcode, `/api/admin/images?${sp}`);
      setItems(d.images || []);
      setCollections(d.collections || []);
      setConfigured(!!d.configured);
      setBackend(d.backend ?? null);
      setMsg("");
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }, [passcode, collection, pillarId, debouncedQ, fail]);

  useEffect(() => {
    void load();  
  }, [load]);

  if (!hydrated) return null;
  if (!passcode) {
    return <PasscodeForm prompt="Enter the admin passcode to open the Library." msg={msg} onUnlock={setPasscode} />;
  }

  const total = collections.reduce((n, c) => n + c.count, 0);
  const noDb = configured === false || (configured && backend !== "db");

  return (
    <div className="mx-auto max-w-6xl">
      {noDb && (
        <div className="mb-4 rounded-2xl border-2 border-sun/40 bg-sun-soft/50 p-3 text-sm text-ink">
          <b>The library needs a database.</b> Set <code className="font-mono">DIRECT_DATABASE_URL</code>, run{" "}
          <code className="font-mono">npx prisma db push</code> and redeploy. Stock search still works in the pickers.
        </div>
      )}
      {msg && <p className="mb-3 text-sm font-semibold text-berry">{msg}</p>}

      {/* toolbar */}
      <div className="rounded-2xl border-2 border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${FIELD} min-w-[180px] flex-1`} placeholder="Search title, tag, credit…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the library" />
          <button type="button" className={PRIMARY} onClick={() => setPicker("upload")} disabled={!!noDb}>
            + Upload
          </button>
          <button type="button" className={SMALL} onClick={() => setPicker("search")} disabled={!!noDb}>
            Find stock photo
          </button>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setCollection("")} className={`${CHIP} ${collection === "" ? ON : OFF}`} aria-pressed={collection === ""}>
            All{total ? ` · ${total}` : ""}
          </button>
          {collections.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setCollection(collection === c.name ? "" : c.name)}
              className={`${CHIP} ${collection === c.name ? ON : OFF}`}
              aria-pressed={collection === c.name}
            >
              {c.name} · {c.count}
            </button>
          ))}
        </div>
        {pillars.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Pillar</span>
            <button type="button" onClick={() => setPillarId("")} className={`${CHIP} ${pillarId === "" ? ON : OFF}`} aria-pressed={pillarId === ""}>
              Any
            </button>
            {pillars.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPillarId(pillarId === p.id ? "" : p.id)}
                className={`${CHIP} ${pillarId === p.id ? ON : OFF}`}
                aria-pressed={pillarId === p.id}
                title={p.message}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* grid */}
      <div className="mt-4">
        {loading && items.length === 0 ? (
          <p className="text-sm text-muted">Loading the library…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-sm text-muted">
            {collection || pillarId || debouncedQ ? "Nothing matches those filters." : "The library is empty — upload an image or import a stock photo."}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((it) => (
              <Card
                key={it.id}
                it={it}
                passcode={passcode}
                collections={collections.map((c) => c.name)}
                onSaved={(next) => {
                  setItems((prev) => prev.map((x) => (x.id === next.id ? next : x)));
                  void load(); // collection counts may have moved
                }}
                onDeleted={(id) => {
                  setItems((prev) => prev.filter((x) => x.id !== id));
                  void load();
                }}
                onError={fail}
              />
            ))}
          </ul>
        )}
        {loading && items.length > 0 && <p className="mt-2 text-xs text-muted">Refreshing…</p>}
      </div>

      <ImagePicker
        open={picker !== ""}
        onClose={() => setPicker("")}
        passcode={passcode}
        initialTab={picker === "search" ? "search" : "upload"}
        tabs={["upload", "search"]}
        pillarId={pillarId || null}
        collection={collection || null}
        heading={picker === "search" ? "Import a stock photo" : "Add to the library"}
        onPick={() => {
          setPicker("");
          void load();
        }}
      />
    </div>
  );
}
