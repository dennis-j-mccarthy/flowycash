"use client";

import { useEffect, useSyncExternalStore } from "react";
import { PASS_KEY, adminHeaders } from "@/components/PasscodeGate";
import { DEFAULT_PILLARS, type Pillar } from "@/lib/pillars";

/*
  Browser-side pillars — ONE fetch of GET /api/admin/pillars?all=1 shared by
  every component on the page (tags, chips, the post maker, the editor),
  cached at module level and pushed to subscribers. Mutations in the
  PillarsEditor call refreshPillars() so the tags elsewhere update too.

    const { pillars, loaded } = usePillars(passcode);                 // active, in order
    const { pillars } = usePillars(passcode, { includeInactive: true });

  The passcode is optional: without one the hook reads the saved admin
  passcode from localStorage (PASS_KEY), which is how PillarTag — rendered
  deep inside lists — gets by without a prop. A failed fetch (no passcode
  yet, 401) leaves the cache unloaded and retries when the passcode changes;
  a server error falls back to the code defaults so tags still render.
*/

type Snapshot = {
  all: Pillar[];
  active: Pillar[];
  loaded: boolean;
  db: boolean | null;
};

let snap: Snapshot = { all: [], active: [], loaded: false, db: null };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let inflightPass = "";

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function readPass(): string {
  try {
    return localStorage.getItem(PASS_KEY) || "";
  } catch {
    return "";
  }
}

/** Replace the cache (what the editor does after a mutation). */
export function setPillarsCache(all: Pillar[], db: boolean | null = snap.db) {
  const sorted = [...all].sort((a, b) => a.sortOrder - b.sortOrder);
  snap = { all: sorted, active: sorted.filter((p) => p.active), loaded: true, db };
  emit();
}

/** Re-fetch from the server; de-duplicated while a request is in flight. */
export function refreshPillars(passcode?: string): Promise<void> {
  const pass = passcode || readPass();
  if (!pass) return Promise.resolve();
  if (inflight && inflightPass === pass) return inflight;
  inflightPass = pass;
  inflight = fetch("/api/admin/pillars?all=1", { headers: adminHeaders(pass) })
    .then(async (r) => {
      const d = (await r.json().catch(() => ({}))) as { pillars?: Pillar[]; db?: boolean; error?: string };
      if (r.status === 401) return; // wrong / missing passcode: stay unloaded, retry later
      if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
      setPillarsCache(Array.isArray(d.pillars) ? d.pillars : [], !!d.db);
    })
    .catch(() => {
      if (!snap.loaded) setPillarsCache(DEFAULT_PILLARS, false);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const getSnapshot = () => snap;

export function usePillars(passcode?: string, opts: { includeInactive?: boolean } = {}) {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (!s.loaded || (passcode && passcode !== inflightPass)) void refreshPillars(passcode);
    // Re-run only when the passcode changes or the cache is (still) empty.
  }, [passcode, s.loaded]);
  return {
    pillars: opts.includeInactive ? s.all : s.active,
    loaded: s.loaded,
    db: s.db,
    refresh: refreshPillars,
  };
}
