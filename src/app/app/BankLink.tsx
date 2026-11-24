"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

// "Connect bank": link a bank through Plaid, pick the account the calendar
// tracks, sync on demand, disconnect. Lives in Labs until Plaid production
// access is approved; in sandbox it talks to Plaid's fake bank only.

export interface PlaidItemInfo {
  itemId: string; institutionName: string; status: string; lastError: string;
  trackedAccountId: string | null; trackedName: string; trackedMask: string;
  lastSyncedAt: string | null; lastBalance: number | null;
}
interface Acct { id: string; name: string; mask: string; balance: number; type: string }

interface Theme { headerBg: string; accent: string; totalBg: string }
interface Props {
  th: Theme;
  api: (url: string, opts?: RequestInit) => Promise<Record<string, unknown>>;
  reload: () => Promise<void>;
  onClose: () => void;
  onChanged?: () => void;
  fmt: (v: number) => string;
}

export default function BankLink({ th, api, reload, onClose, onChanged, fmt }: Props) {
  const [items, setItems] = useState<PlaidItemInfo[] | null>(null);
  const [env, setEnv] = useState<string>("");
  const [configured, setConfigured] = useState(true);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");
  const [pick, setPick] = useState<{ itemId: string; institutionName: string; accounts: Acct[]; chosen: string | null } | null>(null);
  const [syncMsg, setSyncMsg] = useState("");

  const refresh = useCallback(async () => {
    const r = await api("/api/plaid/item");
    if (r.error) { setErr(String(r.error)); setItems([]); return; }
    setItems((r.items as PlaidItemInfo[]) || []);
    setEnv(String(r.env || ""));
    setConfigured(r.configured !== false);
  }, [api]);
  useEffect(() => { refresh(); }, [refresh]);

  async function startLink(itemId?: string) {
    setErr(""); setBusy("token");
    try {
      const r = await api("/api/plaid/link-token", { method: "POST", body: JSON.stringify(itemId ? { itemId } : {}) });
      if (r.error) throw new Error(String(r.error));
      setLinkToken(String(r.link_token));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      setBusy("exchange"); setErr("");
      try {
        const r = await api("/api/plaid/exchange", { method: "POST", body: JSON.stringify({ public_token, metadata }) });
        if (r.error && !r.ok) throw new Error(String(r.error));
        const accounts = (r.accounts as Acct[]) || [];
        const current = r.account as Acct | null;
        setPick({ itemId: String(r.itemId), institutionName: String(r.institutionName || metadata.institution?.name || "Bank"), accounts, chosen: current?.id || (accounts.length === 1 ? accounts[0].id : null) });
        await refresh();
        onChanged?.();
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
      finally { setBusy(""); setLinkToken(null); }
    },
    onExit: () => { setLinkToken(null); },
  });
  useEffect(() => { if (linkToken && ready) open(); }, [linkToken, ready, open]);

  async function savePick() {
    if (!pick || !pick.chosen) return;
    const a = pick.accounts.find((x) => x.id === pick.chosen);
    setBusy("pick");
    try {
      await api("/api/plaid/item", { method: "PUT", body: JSON.stringify({ itemId: pick.itemId, accountId: pick.chosen, name: a?.name || "", mask: a?.mask || "" }) });
      setPick(null);
      await refresh();
      onChanged?.();
    } finally { setBusy(""); }
  }

  async function syncNow(apply: boolean) {
    setBusy("sync"); setSyncMsg(""); setErr("");
    try {
      const r = await api(`/api/plaid/sync${apply ? "?apply=1" : ""}`, { method: "POST" });
      if (r.error) throw new Error(String(r.error));
      const results = (r.results as { account: Acct | null; transactions: unknown[]; applied: { moved: number } | null; error?: string }[]) || [];
      const lines = results.map((x) => x.error ? `Error: ${x.error}` : x.account ? `${x.account.name} …${x.account.mask}: ${fmt(x.account.balance)}, ${x.transactions.length} new posted transaction${x.transactions.length === 1 ? "" : "s"}${x.applied ? `. Reset saved for today, ${x.applied.moved} moved.` : "."}` : "No tracked account yet. Pick one below.");
      setSyncMsg(lines.join(" "));
      if (apply) { await reload(); onChanged?.(); }
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  async function disconnect(itemId: string) {
    if (!confirm("Disconnect this bank? The calendar keeps every balance and item it already has; only the live link is removed.")) return;
    setBusy("remove");
    try { await api("/api/plaid/item", { method: "DELETE", body: JSON.stringify({ itemId }) }); await refresh(); onChanged?.(); }
    finally { setBusy(""); }
  }

  const primary: React.CSSProperties = { padding: "12px 16px", borderRadius: 12, border: "none", background: th.headerBg, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const secondary: React.CSSProperties = { padding: "10px 14px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, animation: "panelIn 0.18s ease" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "26px 28px 24px", width: 500, maxWidth: "94vw", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", color: "#0f172a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>Connect bank</span>
          <button onClick={onClose} className="bf-btn" style={{ border: "none", background: "none", fontSize: 22, color: "#94a3b8", cursor: "pointer", padding: "2px 6px" }} aria-label="Close">×</button>
        </div>
        <p style={{ fontSize: 13.5, color: "#475569", lineHeight: 1.5, margin: "0 0 14px" }}>
          Link your bank through Plaid. Every morning the calendar sets today&rsquo;s balance from the account you choose and moves anything that already cleared onto the day it posted. Read only; Flowy Cash can never move money.
          {env === "sandbox" && <> <strong style={{ color: "#b45309" }}>Sandbox mode:</strong> this connects to Plaid&rsquo;s test bank, not a real one. Use user_good / pass_good.</>}
        </p>

        {!configured && <div style={{ fontSize: 13, color: "#b91c1c", marginBottom: 12 }}>Plaid keys are not set on this server yet.</div>}
        {err && <div style={{ fontSize: 13, color: "#b91c1c", marginBottom: 12 }}>{err}</div>}

        {items === null ? <div style={{ fontSize: 13, color: "#94a3b8" }}>Loading…</div> : items.length === 0 ? (
          <div style={{ border: `1.5px dashed ${th.accent}`, borderRadius: 14, padding: 18, textAlign: "center", background: th.totalBg }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>No bank linked yet.</div>
            <button onClick={() => startLink()} disabled={!!busy || !configured} style={{ ...primary, opacity: busy ? 0.7 : 1 }}>{busy === "token" ? "Opening…" : "Connect a bank"}</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((it) => (
              <div key={it.itemId} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{it.institutionName || "Bank"}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: it.status === "ok" ? "#047857" : "#b91c1c" }}>{it.status === "ok" ? "Connected" : it.status === "login_required" ? "Needs sign-in" : "Error"}</span>
                </div>
                <div style={{ fontSize: 13, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>
                  {it.trackedAccountId ? <>Tracking <strong>{it.trackedName}{it.trackedMask ? ` …${it.trackedMask}` : ""}</strong>{it.lastBalance != null && <>, last read <strong>{fmt(it.lastBalance)}</strong></>}{it.lastSyncedAt && <> on {new Date(it.lastSyncedAt).toLocaleString()}</>}.</> : <>No account chosen yet.</>}
                  {it.lastError && it.status !== "ok" && <div style={{ color: "#b91c1c", fontSize: 12 }}>{it.lastError}</div>}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {it.status === "login_required" && <button onClick={() => startLink(it.itemId)} disabled={!!busy} style={{ ...secondary, color: "#b91c1c", borderColor: "#fecaca" }}>Sign in again</button>}
                  <button onClick={() => syncNow(false)} disabled={!!busy} style={secondary}>{busy === "sync" ? "Syncing…" : "Check balance"}</button>
                  <button onClick={() => syncNow(true)} disabled={!!busy || !it.trackedAccountId} style={{ ...secondary, color: th.headerBg, borderColor: th.accent, background: th.totalBg }}>Sync and set today&rsquo;s balance</button>
                  <button onClick={async () => { setBusy("sync"); try { const r = await api("/api/plaid/sync", { method: "POST" }); const res = (r.results as { itemId: string; accounts: Acct[]; account: Acct | null }[] | undefined)?.find((x) => x.itemId === it.itemId); if (res) setPick({ itemId: it.itemId, institutionName: it.institutionName, accounts: res.accounts, chosen: it.trackedAccountId || res.account?.id || null }); } finally { setBusy(""); } }} disabled={!!busy} style={secondary}>Change account</button>
                  <button onClick={() => disconnect(it.itemId)} disabled={!!busy} style={{ ...secondary, color: "#b91c1c" }}>Disconnect</button>
                </div>
              </div>
            ))}
            <button onClick={() => startLink()} disabled={!!busy || !configured} style={{ ...secondary, alignSelf: "flex-start" }}>Connect another bank</button>
          </div>
        )}

        {syncMsg && <div style={{ marginTop: 12, padding: "10px 12px", background: th.totalBg, border: `1px solid ${th.accent}55`, borderRadius: 10, fontSize: 13, lineHeight: 1.5 }}>{syncMsg}</div>}

        {pick && (
          <div style={{ marginTop: 14, border: `1.5px solid ${th.accent}`, borderRadius: 14, padding: "12px 14px", background: th.totalBg }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Which account does this calendar track?</div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 10 }}>{pick.institutionName} shared {pick.accounts.length} account{pick.accounts.length === 1 ? "" : "s"}. Pick the one your calendar is about.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pick.accounts.map((a) => {
                const on = pick.chosen === a.id;
                return (
                  <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: `1.5px solid ${on ? th.headerBg : "#e2e8f0"}`, background: "#fff", cursor: "pointer", fontSize: 13 }}>
                    <input type="radio" name="tracked" checked={on} onChange={() => setPick({ ...pick, chosen: a.id })} />
                    <span style={{ flex: 1, fontWeight: 600 }}>{a.name}{a.mask ? ` …${a.mask}` : ""} <span style={{ fontWeight: 400, color: "#94a3b8" }}>{a.type}</span></span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmt(a.balance)}</span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={savePick} disabled={!pick.chosen || !!busy} style={{ ...primary, flex: 1, opacity: pick.chosen ? 1 : 0.5 }}>Track this account</button>
              <button onClick={() => setPick(null)} style={secondary}>Later</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 14, lineHeight: 1.45 }}>
          Your bank login goes to Plaid, not to Flowy Cash. We store an encrypted access token, the account name and last four digits, and the balance it reports. Disconnect removes the link at Plaid and here.
        </div>
      </div>
    </div>
  );
}
