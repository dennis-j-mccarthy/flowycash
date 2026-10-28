"use client";

import { useCallback, useEffect, useState } from "react";
import { SocialDraftsPicker, SocialQueue, type SocialDraft } from "@/components/SocialPanels";
import { adminHeaders } from "@/components/PasscodeGate";
import { PostMaker } from "@/components/PostMaker";

/*
  /admin/social — the post maker page. This component owns the passcode
  gate, the Meta connection status, the loaded draft and the two
  database-backed panels; the four-step builder itself is PostMaker.tsx
  (① image → ② platform → ③ pillar → ④ caption → publish / schedule).

  Activation is env-only: META_PAGE_ID + META_PAGE_TOKEN (falling back to
  FB_PAGE_ID + FB_PAGE_TOKEN). When no token is set, the server reports
  "not connected" and publishing is disabled (drafting and copying still
  work). Passcode-gated like the content board; the code is remembered in
  localStorage under "flowycash-admin-pass".

  With DIRECT_DATABASE_URL set, two panels join the maker: "From drafts" (the
  SocialDraft rows written when a blog post is published — pick one and it
  pre-fills all four steps) and "Queue" (what's scheduled/published, with
  permalink + Cancel). When a draft is loaded its id rides along on the post
  call so the result is recorded back onto that row. /admin/social?draft=<id>
  preloads a draft.
*/

type Config = {
  connected: boolean;
  instagram: boolean;
  page: string | null;
  igUsername: string | null;
};

export function SocialComposer() {
  const [passcode, setPasscode] = useState("");
  const [cfg, setCfg] = useState<Config | null>(null);
  const [msg, setMsg] = useState("");

  // queue integration
  const [draft, setDraft] = useState<SocialDraft | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const onAuthError = useCallback(() => {
    try { localStorage.removeItem("flowycash-admin-pass"); } catch {}
    setPasscode("");
    setMsg("Wrong passcode.");
  }, []);

  const loadDraft = useCallback((d: SocialDraft) => {
    setDraft(d);
    setMsg("");
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  }, []);

  const clearDraft = useCallback(() => setDraft(null), []);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const saved = localStorage.getItem("flowycash-admin-pass") || "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPasscode(saved);
  }, []);

  useEffect(() => {
    if (!passcode) return;
    let cancelled = false;
    fetch("/api/admin/fbpost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode, action: "config" }),
    })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 401) return onAuthError();
        if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
        setCfg(d as Config);
      })
      .catch((e) => {
        if (!cancelled) setMsg((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [passcode, onAuthError]);

  // Deep link: /admin/social?draft=<id> preloads that draft once unlocked.
  useEffect(() => {
    if (!passcode) return;
    let id = "";
    try { id = new URLSearchParams(window.location.search).get("draft") || ""; } catch {}
    if (!id) return;
    let cancelled = false;
    fetch(`/api/admin/social/drafts/${id}`, { headers: adminHeaders(passcode) })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !d.draft) return;
        loadDraft(d.draft as SocialDraft);
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("draft");
          window.history.replaceState({}, "", url);
        } catch {}
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [passcode, loadDraft]);

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
        <p className="text-muted">Enter the admin passcode to open the post maker.</p>
        {msg && <p className="mt-2 text-sm font-semibold text-berry">{msg} Try again.</p>}
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

  const connected = !!cfg?.connected;

  return (
    <div className="mx-auto max-w-5xl">
      {/* connection status */}
      <div
        className={`rounded-2xl border-2 p-4 text-sm ${
          connected ? "border-sea/40 bg-sea-soft/40 text-ink" : "border-sun/40 bg-sun-soft/50 text-ink"
        }`}
      >
        {cfg === null ? (
          <>Checking the Meta connection…</>
        ) : connected ? (
          <>
            Connected to <b>{cfg.page}</b>
            {cfg.instagram ? <> · Instagram @{cfg.igUsername ?? "linked"}</> : <> · no Instagram linked</>}
          </>
        ) : (
          <>
            Not connected. Set <code className="font-mono">META_PAGE_ID</code> +{" "}
            <code className="font-mono">META_PAGE_TOKEN</code> (or the existing{" "}
            <code className="font-mono">FB_PAGE_ID</code> + <code className="font-mono">FB_PAGE_TOKEN</code>) in
            the environment, then reload. Drafting and copying still work.
          </>
        )}
      </div>

      {msg && <p className="mt-3 text-sm font-semibold text-berry">{msg}</p>}

      {/* the four-step maker */}
      <div className="mt-5">
        <PostMaker
          passcode={passcode}
          cfg={cfg}
          draft={draft}
          onDetach={clearDraft}
          onPosted={bump}
          onAuthError={onAuthError}
        />
      </div>

      {/* database-backed panels */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <SocialDraftsPicker
          passcode={passcode}
          refreshKey={refreshKey}
          activeId={draft?.id ?? null}
          onPick={loadDraft}
          onAuthError={onAuthError}
        />
        <SocialQueue passcode={passcode} refreshKey={refreshKey} onAuthError={onAuthError} onChanged={bump} />
      </div>
    </div>
  );
}
