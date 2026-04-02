"use client";

import { useState, useEffect, useCallback } from "react";
import type { Transaction, OverrideData, AppState } from "@/lib/types";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dkey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function pdk(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}
function dim(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function fmt(v: number) {
  const a = Math.abs(v);
  const s = a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-$${s}` : `$${s}`;
}
function fmtShort(v: number) {
  const a = Math.abs(v);
  if (a >= 10000) {
    const k = a / 1000;
    return (v < 0 ? "-" : "") + "$" + k.toFixed(1) + "k";
  }
  return fmt(v);
}
function friendlyDate(s: string) {
  const { month, day } = pdk(s);
  return `${MONTHS[month].slice(0, 3)} ${day}`;
}

function getOccurrences(startDate: string, recurrence: string, rStart: string, rEnd: string) {
  if (recurrence === "none") return startDate >= rStart && startDate <= rEnd ? [startDate] : [];
  const dates: string[] = [];
  const { year, month, day } = pdk(startDate);
  let cur = new Date(year, month, day);
  const end = new Date(pdk(rEnd).year, pdk(rEnd).month, pdk(rEnd).day);
  const start = new Date(pdk(rStart).year, pdk(rStart).month, pdk(rStart).day);
  let i = 0;
  while (cur <= end && i < 500) {
    i++;
    if (cur >= start) dates.push(dkey(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    if (recurrence === "weekly") cur.setDate(cur.getDate() + 7);
    else if (recurrence === "biweekly") cur.setDate(cur.getDate() + 14);
    else if (recurrence === "monthly") cur = new Date(cur.getFullYear(), cur.getMonth() + 1, day);
    else if (recurrence === "yearly") cur = new Date(cur.getFullYear() + 1, month, day);
  }
  return dates;
}

const RECUR = [
  { v: "none", l: "One-time" },
  { v: "weekly", l: "Weekly" },
  { v: "biweekly", l: "Biweekly" },
  { v: "monthly", l: "Monthly" },
  { v: "yearly", l: "Yearly" },
];

const DEF: AppState = { transactions: [], overrides: {}, balanceResets: {}, startingBalance: 0 };

interface DisplayTransaction extends Transaction {
  occurrenceDate: string;
  displayDate: string;
}

interface PendingAction {
  type: "edit" | "delete" | "move";
  tx: Transaction;
  occDate: string;
  formData?: { name: string; amount: number; type: string };
  newDate?: string;
}

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  return res.json();
}

export default function BudgetForecast() {
  const [state, setState] = useState<AppState>(DEF);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"calendar" | "list">(() => typeof window !== "undefined" && window.innerWidth >= 1000 ? "calendar" : "list");
  useEffect(() => {
    const onResize = () => setView(window.innerWidth >= 1000 ? "calendar" : "list");
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [cY, setCY] = useState(new Date().getFullYear());
  const [cM, setCM] = useState(new Date().getMonth());
  const [panel, setPanel] = useState<string | null>(null);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editDate, setEditDate] = useState<string | null>(null);
  const [recurPrompt, setRecurPrompt] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [dragItem, setDragItem] = useState<{ tx: Transaction; od: string } | null>(null);
  const [dropTgt, setDropTgt] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", amount: "", type: "expense", recurrence: "none", date: "" });
  const [resetAmt, setResetAmt] = useState("");
  const [resetDt, setResetDt] = useState("");
  const [balInput, setBalInput] = useState("");

  const reload = useCallback(async () => {
    const data = await api("/api/state");
    setState(data);
    return data;
  }, []);

  useEffect(() => {
    reload().then((data) => {
      setBalInput(String(data.startingBalance || 0));
      setLoaded(true);
    });
  }, [reload]);

  const rStart = dkey(cY, cM, 1);
  const rEnd = dkey(cY, cM, dim(cY, cM));

  const dailyData = useCallback(() => {
    const days = dim(cY, cM);
    const allDk: string[] = [];
    for (let d = 1; d <= days; d++) allDk.push(dkey(cY, cM, d));
    const txByDate: Record<string, DisplayTransaction[]> = {};
    allDk.forEach((k) => (txByDate[k] = []));
    state.transactions.forEach((tx) => {
      const occs = getOccurrences(tx.startDate, tx.recurrence, rStart, rEnd);
      occs.forEach((odk) => {
        const ok = `${tx.id}::${odk}`;
        const ov = state.overrides[ok] as OverrideData | undefined;
        if (ov?.deleted) return;
        const eff = ov ? { ...tx, ...ov, id: tx.id, recurrence: tx.recurrence, startDate: tx.startDate } : tx;
        const disp = ov?.movedTo || odk;
        if (!txByDate[disp]) txByDate[disp] = [];
        txByDate[disp].push({ ...eff, occurrenceDate: odk, displayDate: disp } as DisplayTransaction);
      });
    });
    let bal = state.startingBalance;
    const resets = state.balanceResets || {};
    const result: { date: string; day: number; transactions: DisplayTransaction[]; balance: number; hasReset: boolean }[] = [];
    for (let d = 1; d <= days; d++) {
      const key = dkey(cY, cM, d);
      if (resets[key] !== undefined) bal = resets[key];
      const dayTxs = txByDate[key] || [];
      dayTxs.forEach((tx) => {
        bal += (tx.type === "income" ? 1 : -1) * Math.abs(tx.amount);
      });
      result.push({ date: key, day: d, transactions: dayTxs, balance: Math.round(bal * 100) / 100, hasReset: resets[key] !== undefined });
    }
    return result;
  }, [state, cY, cM, rStart, rEnd]);

  const data = loaded ? dailyData() : [];
  const dayMap: Record<string, (typeof data)[number]> = {};
  data.forEach((d) => (dayMap[d.date] = d));

  const openPanel = (p: string) => {
    setPanel(p);
    setRecurPrompt(false);
  };
  function openAdd(date: string | null) {
    setEditTx(null);
    setEditDate(null);
    setForm({ name: "", amount: "", type: "expense", recurrence: "none", date: date || dkey(cY, cM, Math.min(new Date().getDate(), dim(cY, cM))) });
    openPanel("tx");
  }
  function openEdit(tx: Transaction, od: string) {
    setEditTx(tx);
    setEditDate(od);
    const ok = `${tx.id}::${od}`;
    const ov = state.overrides[ok] as OverrideData | undefined;
    const e = ov ? { ...tx, ...ov } : tx;
    setForm({ name: e.name || tx.name, amount: String(Math.abs(e.amount ?? tx.amount)), type: e.type || tx.type, recurrence: tx.recurrence, date: od });
    openPanel("tx");
  }

  async function handleSave() {
    const amt = parseFloat(form.amount);
    if (!form.name || isNaN(amt)) return;
    if (editTx) {
      if (editTx.recurrence !== "none") {
        setPending({ type: "edit", formData: { name: form.name, amount: amt, type: form.type }, tx: editTx, occDate: editDate! });
        setRecurPrompt(true);
        setPanel(null);
        return;
      }
      await api(`/api/transactions/${editTx.id}`, { method: "PUT", body: JSON.stringify({ name: form.name, amount: amt, type: form.type }) });
    } else {
      await api("/api/transactions", { method: "POST", body: JSON.stringify({ name: form.name, amount: amt, type: form.type, recurrence: form.recurrence, startDate: form.date }) });
    }
    await reload();
    setPanel(null);
  }

  async function handleDelete() {
    if (!editTx) return;
    if (editTx.recurrence !== "none") {
      setPending({ type: "delete", tx: editTx, occDate: editDate! });
      setRecurPrompt(true);
      setPanel(null);
      return;
    }
    await api(`/api/transactions/${editTx.id}`, { method: "DELETE" });
    await reload();
    setPanel(null);
  }

  async function handleRecur(choice: string | null) {
    setRecurPrompt(false);
    if (!choice || !pending) {
      setPending(null);
      return;
    }
    const { type, tx, occDate } = pending;
    if (type === "delete") {
      if (choice === "one") {
        await api("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occDate, deleted: true }) });
      } else {
        await api(`/api/transactions/${tx.id}`, { method: "DELETE" });
      }
    } else if (type === "edit") {
      const fd = pending.formData!;
      if (choice === "one") {
        await api("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occDate, name: fd.name, amount: fd.amount, type: fd.type }) });
      } else {
        await api(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ name: fd.name, amount: fd.amount, type: fd.type }) });
      }
    } else if (type === "move") {
      const newDate = pending.newDate!;
      if (choice === "one") {
        await api("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occDate, movedTo: newDate }) });
      } else {
        await api(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ startDate: newDate }) });
      }
    }
    await reload();
    setPending(null);
  }

  async function handleResetSave() {
    const a = parseFloat(resetAmt);
    if (isNaN(a) || !resetDt) return;
    await api("/api/balance-resets", { method: "POST", body: JSON.stringify({ date: resetDt, amount: a }) });
    await reload();
    setPanel(null);
    setResetAmt("");
  }

  async function handleBalSave() {
    const v = parseFloat(balInput);
    if (isNaN(v)) return;
    await api("/api/settings", { method: "PUT", body: JSON.stringify({ startingBalance: v }) });
    await reload();
    setPanel(null);
  }

  async function deleteReset(date: string) {
    await api(`/api/balance-resets/${date}`, { method: "DELETE" });
    await reload();
  }

  function onDragStart(e: React.DragEvent, tx: Transaction, od: string) {
    setDragItem({ tx, od });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
  }
  async function onDrop(e: React.DragEvent, targetDate: string) {
    e.preventDefault();
    setDropTgt(null);
    if (!dragItem) return;
    const { tx, od } = dragItem;
    if (targetDate === od) {
      setDragItem(null);
      return;
    }
    if (tx.recurrence !== "none") {
      setPending({ type: "move", tx, occDate: od, newDate: targetDate });
      setRecurPrompt(true);
    } else {
      await api(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ startDate: targetDate }) });
      await reload();
    }
    setDragItem(null);
  }

  const prevM = () => {
    if (cM === 0) { setCM(11); setCY(cY - 1); } else setCM(cM - 1);
  };
  const nextM = () => {
    if (cM === 11) { setCM(0); setCY(cY + 1); } else setCM(cM + 1);
  };
  const today = new Date();
  const todayKey = dkey(today.getFullYear(), today.getMonth(), today.getDate());

  if (!loaded)
    return (
      <div style={{ padding: "4rem", textAlign: "center", color: "#94a3b8", fontSize: 14, letterSpacing: "-0.01em" }}>
        Loading your forecast...
      </div>
    );

  const fow = new Date(cY, cM, 1).getDay();
  const daysInMonth = dim(cY, cM);
  const weeks: (number | null)[][] = [];
  let wk: (number | null)[] = new Array(fow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    wk.push(d);
    if (wk.length === 7) { weeks.push(wk); wk = []; }
  }
  if (wk.length) {
    while (wk.length < 7) wk.push(null);
    weeks.push(wk);
  }

  const minBal = data.length ? Math.min(...data.map((d) => d.balance)) : 0;
  const endBal = data.length ? data[data.length - 1].balance : 0;
  const totalIn = data.reduce((s, d) => s + d.transactions.filter((t) => t.type === "income").reduce((a, t) => a + Math.abs(t.amount), 0), 0);
  const totalOut = data.reduce((s, d) => s + d.transactions.filter((t) => t.type === "expense").reduce((a, t) => a + Math.abs(t.amount), 0), 0);

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
    * { box-sizing: border-box; margin: 0; }
    @keyframes panelIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
    .bf-btn { transition: all 0.12s ease; cursor: pointer; }
    .bf-btn:hover { transform: translateY(-1px); }
    .bf-btn:active { transform: translateY(0); }
    .bf-input { width:100%; padding:10px 14px; border-radius:10px; border:1.5px solid #e2e8f0; font-size:14px; font-family:inherit; background:#fff; color:#1e293b; outline:none; transition: border 0.15s, box-shadow 0.15s; }
    .bf-input:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,0.1); }
    .bf-input::placeholder { color: #94a3b8; }
    .bf-select { width:100%; padding:10px 14px; border-radius:10px; border:1.5px solid #e2e8f0; font-size:14px; font-family:inherit; background:#fff; color:#1e293b; height:44px; outline:none; cursor:pointer; }
    .bf-select:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,0.1); }
    .cal-cell { transition: background 0.1s; }
    .cal-cell:hover { background: #f8fafc !important; }
    .tx-chip { transition: all 0.1s; cursor: grab; }
    .tx-chip:hover { filter: brightness(0.95); transform: translateX(1px); }
    .list-row { transition: background 0.1s; }
    .list-row:hover { background: #f8fafc; }
  `;

  const C = {
    green: "#10b981", greenDark: "#059669", greenBg: "rgba(16,185,129,0.08)", greenBorder: "rgba(16,185,129,0.2)",
    red: "#ef4444", redDark: "#dc2626", redBg: "rgba(239,68,68,0.06)", redBorder: "rgba(239,68,68,0.2)",
    blue: "#3b82f6", blueDark: "#2563eb", blueBg: "rgba(59,130,246,0.06)", blueBorder: "rgba(59,130,246,0.2)",
  };

  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, sans-serif', width: "100%", margin: 0, padding: "24px 32px", color: "#1e293b", height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{css}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={prevM} className="bf-btn" style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "#f1f5f9", fontSize: 14, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em", minWidth: 170, textAlign: "center" }}>{MONTHS[cM]} {cY}</span>
          <button onClick={nextM} className="bf-btn" style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "#f1f5f9", fontSize: 14, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {[
            { label: "In", val: `+${fmtShort(totalIn)}`, color: C.greenDark, border: C.green },
            { label: "Out", val: `-${fmtShort(totalOut)}`, color: C.redDark, border: C.red },
          ].map(({ label, val, color, border }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "#fff", border: `1.5px solid ${border}` }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{val}</span>
            </div>
          ))}
          <div style={{ width: 1, height: 20, background: "#e2e8f0" }} />
          {[
            { label: "Low", val: fmtShort(minBal), color: minBal < 0 ? C.redDark : "#64748b", border: minBal < 0 ? C.red : "#d1d5db" },
            { label: "End", val: fmtShort(endBal), color: endBal < 0 ? C.redDark : C.greenDark, border: endBal < 0 ? C.red : C.green },
          ].map(({ label, val, color, border }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "#fff", border: `1.5px solid ${border}` }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction Modal */}
      {panel === "tx" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, animation: "panelIn 0.18s ease" }}
          onClick={(e) => { if (e.target === e.currentTarget) setPanel(null); }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "32px 32px 28px", width: 440, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{editTx ? "Edit Transaction" : "New Transaction"}</span>
              <button onClick={() => setPanel(null)} className="bf-btn" style={{ border: "none", background: "none", fontSize: 22, color: "#94a3b8", cursor: "pointer", padding: "2px 6px" }}>×</button>
            </div>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24, lineHeight: 1.5 }}>
              {editTx ? "Update the details below." : `Adding to ${friendlyDate(form.date)}.`}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Name</label>
                <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Netflix, Rent, Paycheck..." className="bf-input" style={{ fontSize: 16, padding: "12px 16px" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Amount</label>
                  <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className="bf-input" style={{ fontSize: 16, padding: "12px 16px" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Type</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setForm({ ...form, type: "expense" })} className="bf-btn"
                      style={{ flex: 1, padding: "12px", borderRadius: 10, border: form.type === "expense" ? `2px solid ${C.red}` : "2px solid #e2e8f0",
                        background: form.type === "expense" ? C.redBg : "#fff", color: form.type === "expense" ? C.redDark : "#94a3b8",
                        fontSize: 13, fontWeight: 600 }}>
                      Expense
                    </button>
                    <button onClick={() => setForm({ ...form, type: "income" })} className="bf-btn"
                      style={{ flex: 1, padding: "12px", borderRadius: 10, border: form.type === "income" ? `2px solid ${C.green}` : "2px solid #e2e8f0",
                        background: form.type === "income" ? C.greenBg : "#fff", color: form.type === "income" ? C.greenDark : "#94a3b8",
                        fontSize: 13, fontWeight: 600 }}>
                      Income
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Repeats</label>
                  <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })} className="bf-select" style={{ fontSize: 14, padding: "12px 16px", height: 48 }}>
                    {RECUR.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>{editTx ? "Date" : "Start date"}</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="bf-input" style={{ fontSize: 14, padding: "12px 16px" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button onClick={handleSave} className="bf-btn" style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: C.blueDark, color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
                  {editTx ? "Update" : "Add Transaction"}
                </button>
                {editTx && <button onClick={handleDelete} className="bf-btn" style={{ padding: "14px 24px", borderRadius: 12, border: "none", background: C.redBg, color: C.redDark, fontSize: 15, fontWeight: 600 }}>Delete</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Modal */}
      {panel === "reset" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, animation: "panelIn 0.18s ease" }}
          onClick={(e) => { if (e.target === e.currentTarget) setPanel(null); }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "32px 32px 28px", width: 420, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>Balance Reset</span>
              <button onClick={() => setPanel(null)} className="bf-btn" style={{ border: "none", background: "none", fontSize: 22, color: "#94a3b8", cursor: "pointer", padding: "2px 6px" }}>×</button>
            </div>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 1.5 }}>
              Snap your forecast to reality — set the actual balance for <strong>{friendlyDate(resetDt)}</strong>.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>Actual balance</label>
              <input autoFocus type="number" step="0.01" value={resetAmt} onChange={(e) => setResetAmt(e.target.value)} placeholder="0.00" className="bf-input" style={{ fontSize: 18, padding: "14px 16px" }} />
            </div>
            <button onClick={handleResetSave} className="bf-btn" style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: C.blueDark, color: "#fff", fontSize: 15, fontWeight: 600 }}>Apply reset</button>
            {Object.keys(state.balanceResets || {}).length > 0 && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Active resets</div>
                {Object.entries(state.balanceResets).sort().map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", fontSize: 13, borderBottom: "1px solid #f1f5f9" }}>
                    <span><span style={{ color: "#64748b" }}>{friendlyDate(k)}</span> — <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</span></span>
                    <button onClick={() => deleteReset(k)} className="bf-btn" style={{ border: "none", background: "none", color: C.redDark, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Balance Panel */}
      {panel === "bal" && (
        <div style={{ marginBottom: 16, background: "#fff", borderRadius: 16, border: "1.5px solid #e2e8f0", padding: "22px 24px", animation: "panelIn 0.18s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>Opening balance</span>
            <button onClick={() => setPanel(null)} className="bf-btn" style={{ border: "none", background: "none", fontSize: 20, color: "#64748b", cursor: "pointer", padding: "2px 6px" }}>×</button>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16, lineHeight: 1.5 }}>
            Your account balance at the very start of {MONTHS[cM]}.
          </p>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 5 }}>Amount</label>
            <input type="number" step="0.01" value={balInput} onChange={(e) => setBalInput(e.target.value)} className="bf-input" />
          </div>
          <button onClick={handleBalSave} className="bf-btn" style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: C.blueDark, color: "#fff", fontSize: 14, fontWeight: 600 }}>Save</button>
        </div>
      )}

      {/* Recurring Prompt */}
      {recurPrompt && (
        <div style={{ marginBottom: 16, background: "#f8fafc", borderRadius: 16, border: "1.5px solid #e2e8f0", padding: "22px 24px", animation: "panelIn 0.18s ease" }}>
          <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>Recurring transaction</p>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>How should this change apply?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => handleRecur("one")} className="bf-btn" style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 13, fontWeight: 600 }}>Just this one</button>
            <button onClick={() => handleRecur("future")} className="bf-btn" style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: C.blueDark, color: "#fff", fontSize: 13, fontWeight: 600 }}>This & future</button>
          </div>
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <button onClick={() => { setRecurPrompt(false); setPending(null); }} className="bf-btn" style={{ border: "none", background: "none", color: "#64748b", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {view === "calendar" && (
        <div style={{ overflowX: "auto", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: `45px repeat(${weeks.length}, 1fr)`, borderRadius: 14, overflow: "hidden", border: "1px solid #e2e8f0", flex: 1 }}>
            {DAYS.map((d, i) => (
              <div key={i} style={{ padding: "10px 4px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", textAlign: "center", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>{d}</div>
            ))}
            {weeks.map((wk, wi) =>
              wk.map((day, di) => {
                if (!day)
                  return (
                    <div key={`${wi}-${di}`} style={{ minHeight: 0, background: "#f8fafc", borderTop: "1px solid #e2e8f0", borderRight: di < 6 ? "1px solid #e2e8f0" : "none", opacity: 0.5 }} />
                  );
                const key = dkey(cY, cM, day);
                const dd = dayMap[key];
                const isToday = key === todayKey;
                const isSel = selDay === key;
                return (
                  <div key={key} className="cal-cell"
                    style={{ minHeight: 0,position: "relative", cursor: "pointer", overflow: "hidden",
                      background: isSel ? "#f8fafc" : dd && dd.balance < 0 ? "#fff5f5" : "#fff",
                      borderTop: "1px solid #e2e8f0",
                      borderRight: di < 6 ? "1px solid #e2e8f0" : "none",
                      display: "flex", flexDirection: "column",
                    }}
                    onClick={() => setSelDay(selDay === key ? null : key)}
                    onDragOver={(e) => { e.preventDefault(); setDropTgt(key); }}
                    onDragLeave={() => setDropTgt(null)}
                    onDrop={(e) => onDrop(e, key)}
                  >
                    {dropTgt === key && <div style={{ position: "absolute", inset: 2, background: "rgba(59,130,246,0.06)", border: "2px dashed #3b82f6", borderRadius: 8, pointerEvents: "none", zIndex: 5 }} />}
                    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 7px" }}
                      onClick={(e) => { if (e.target === e.currentTarget) openAdd(key); }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 3 }}>
                        {isToday ? (
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: C.blueDark, width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>{day}</span>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b", lineHeight: "22px" }}>{day}</span>
                        )}
                        {dd?.hasReset && <span style={{ fontSize: 8, fontWeight: 700, background: C.blueDark, color: "#fff", padding: "2px 5px", borderRadius: 4, letterSpacing: "0.04em" }}>RST</span>}
                      </div>
                      <div>
                        {dd?.transactions.map((tx, i) => (
                          <div key={i} className="tx-chip" draggable onDragStart={(e) => onDragStart(e, tx, tx.occurrenceDate)}
                            onClick={(e) => { e.stopPropagation(); openEdit(tx, tx.occurrenceDate); }}
                            style={{ fontSize: 11, fontWeight: 500, padding: "2px 6px", marginTop: 2, borderRadius: 5,
                              background: "transparent",
                              color: tx.type === "income" ? C.greenDark : C.redDark,
                              borderLeft: "none",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                              display: "flex", alignItems: "center", gap: 3 }}>
                            <span style={{ width: 14, flexShrink: 0, fontSize: 13, color: tx.recurrence !== "none" ? "#64748b" : "transparent", lineHeight: 1, textAlign: "center" }}>{tx.recurrence !== "none" ? "↻" : ""}</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{tx.name}</span>
                            <span style={{ marginLeft: "auto", flexShrink: 0, fontVariantNumeric: "tabular-nums", fontSize: 10 }}>{fmtShort(Math.abs(tx.amount)).replace("$", "")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div onClick={(e) => { e.stopPropagation(); setResetDt(key); setResetAmt(""); openPanel("reset"); }}
                      style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, padding: "4px 6px", background: "#fafafa", borderTop: "1px solid #dddddd", cursor: "pointer" }}
                      title="Click to set balance reset">
                      {dd && dd.balance < 0 && <span style={{ fontSize: 16 }}>😢</span>}
                      {dd && <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color: dd.balance < 0 ? C.redDark : C.greenDark }}>{fmtShort(dd.balance)}</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {selDay && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => openAdd(selDay)} className="bf-btn" style={{ fontSize: 12, fontWeight: 500, padding: "7px 16px", borderRadius: 20, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b" }}>
                + Add to {friendlyDate(selDay)}
              </button>
            </div>
          )}
        </div>
      )}

      {/* List View */}
      {view === "list" && (
        <div style={{ borderRadius: 14, border: "1px solid #e2e8f0", overflow: "auto", flex: 1, minHeight: 0 }}>
          {data.map((dd) => {
            const isOpen = expandedDays.has(dd.date);
            const toggleDay = (e: React.MouseEvent) => {
              if (e.altKey) {
                // Option-click: toggle all
                setExpandedDays((prev) => {
                  const allDates = data.map((d) => d.date);
                  const allOpen = allDates.every((d) => prev.has(d));
                  return allOpen ? new Set() : new Set(allDates);
                });
              } else {
                setExpandedDays((prev) => {
                  const next = new Set(prev);
                  next.has(dd.date) ? next.delete(dd.date) : next.add(dd.date);
                  return next;
                });
              }
            };
            return (
              <div key={dd.date} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", cursor: "pointer", background: dd.date === todayKey ? "#f0f7ff" : dd.balance < 0 ? "#fff5f5" : "transparent", userSelect: "none" }}
                  onClick={toggleDay}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: dd.balance < 0 ? C.redDark : "#94a3b8", transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    <span style={{ fontSize: 13, fontWeight: dd.date === todayKey ? 700 : 500, color: dd.date === todayKey ? C.blueDark : dd.balance < 0 ? C.redDark : "#1e293b", letterSpacing: "-0.01em" }}>
                      {DAY_NAMES[new Date(cY, cM, dd.day).getDay()].slice(0, 3)} {dd.day}
                    </span>
                    {dd.hasReset && <span style={{ fontSize: 8, fontWeight: 700, background: C.blueDark, color: "#fff", padding: "2px 5px", borderRadius: 4 }}>RST</span>}
                    {!isOpen && dd.transactions.length > 0 && <span style={{ fontSize: 11, color: "#94a3b8" }}>{dd.transactions.length} item{dd.transactions.length > 1 ? "s" : ""}</span>}
                    {dd.transactions.length === 0 && <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {dd.balance < 0 && <span style={{ fontSize: 14 }}>😢</span>}
                    <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color: dd.balance < 0 ? C.redDark : C.greenDark }}>{fmt(dd.balance)}</span>
                  </div>
                </div>
                {isOpen && (
                  <>
                    {dd.transactions.map((tx, i) => (
                      <div key={i} className="list-row" draggable onDragStart={(e) => onDragStart(e, tx, tx.occurrenceDate)}
                        onClick={() => openEdit(tx, tx.occurrenceDate)}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 18px 8px 44px", cursor: "pointer", borderRadius: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: tx.type === "income" ? C.green : C.red, flexShrink: 0 }} />
                          <span style={{ width: 18, flexShrink: 0, fontSize: 15, color: tx.recurrence !== "none" ? "#64748b" : "transparent", lineHeight: 1, textAlign: "center" }}>{tx.recurrence !== "none" ? "↻" : ""}</span>
                          <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: tx.type === "income" ? C.greenDark : C.redDark }}>{tx.name}</span>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", color: tx.type === "income" ? C.greenDark : C.redDark, flexShrink: 0 }}>
                          {tx.type === "income" ? "+" : "-"}{fmt(Math.abs(tx.amount))}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, padding: "4px 18px", background: "#fafafa", borderTop: "1px solid #dddddd" }}>
                      {dd.balance < 0 && <span style={{ fontSize: 14 }}>😢</span>}
                      <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color: dd.balance < 0 ? C.redDark : C.greenDark }}>{fmt(dd.balance)}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 11, color: "#94a3b8", textAlign: "center", lineHeight: 1.6, letterSpacing: "-0.01em", flexShrink: 0 }}>
        Double-click a day to add · Click a transaction to edit · Drag to reschedule
      </div>
    </div>
  );
}
