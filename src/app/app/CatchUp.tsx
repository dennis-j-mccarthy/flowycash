"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppState } from "@/lib/types";
import { reconcile, type BankData } from "@/lib/reconcile";
import { addDays, balanceOn, dailyBalances, daysBetween, largeGapEvents, occurrencesBetween, outlookAfter, todayKey, type Occ, type Outlook } from "@/lib/catchup";
import { distributeDebt, type DailyPoint, type DebtPlacement } from "@/lib/debt-distribution";

// "Catch up": a short guided check-in for someone who has not opened the app
// in a while. Guess the balance, confirm the big things that happened, enter
// the real balance (typed or from a screenshot/CSV), read a calm verdict, apply.

type EventStatus = "happened" | "skipped" | "changed";
interface EventRow extends Occ { status: EventStatus; newAmount: string }
interface Added { name: string; amount: string; type: "income" | "expense"; date: string }
interface Loan { name: string; amount: number; chunks: DebtPlacement[] }

interface Theme { headerBg: string; accent: string; totalBg: string }

interface Props {
  state: AppState;
  th: Theme;
  demo: boolean;
  since: string | null; // the date we last had a real balance (or last visit)
  api: (url: string, opts?: RequestInit) => Promise<Record<string, unknown>>;
  callApi: (url: string, opts?: RequestInit) => Promise<unknown>;
  reload: () => Promise<void>;
  onClose: () => void;
  onApplied?: () => void;
  fmt: (v: number) => string;
  friendlyDate: (s: string) => string;
}

const STEPS = ["Start", "Guess", "What happened", "Real balance", "Where you stand"];

export default function CatchUp({ state, th, demo, since, api, callApi, reload, onClose, onApplied, fmt, friendlyDate }: Props) {
  const today = todayKey();
  const from = since || addDays(today, -30);
  const gapDays = Math.max(0, daysBetween(from, today));

  const [step, setStep] = useState(0);
  const [guess, setGuess] = useState("");
  const [events, setEvents] = useState<EventRow[]>(() => largeGapEvents(state, from, today).map((o) => ({ ...o, status: "happened", newAmount: String(o.amount) })));
  const [added, setAdded] = useState<Added[]>([]);
  const [addDraft, setAddDraft] = useState<Added>({ name: "", amount: "", type: "expense", date: today });
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanDraft, setLoanDraft] = useState({ name: "", amount: "" });
  const [actual, setActual] = useState("");
  const [bank, setBank] = useState<BankData | null>(null);
  const [bankBusy, setBankBusy] = useState(false);
  const [bankErr, setBankErr] = useState("");
  const [outlook, setOutlook] = useState<Outlook | null>(null);
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<string>("");

  // The plan's number for today, after the user's corrections to the gap.
  const correctedState = useMemo<AppState>(() => {
    const overrides = { ...state.overrides };
    events.forEach((e) => {
      const key = `${e.txId}::${e.occurrenceDate}`;
      if (e.status === "skipped") overrides[key] = { ...overrides[key], deleted: true };
      else if (e.status === "changed") {
        const n = parseFloat(e.newAmount);
        if (!isNaN(n) && n >= 0) overrides[key] = { ...overrides[key], amount: n };
      }
    });
    const transactions = [...state.transactions];
    added.forEach((a, i) => {
      const n = parseFloat(a.amount);
      if (!a.name.trim() || isNaN(n) || n <= 0 || !a.date) return;
      transactions.push({ id: `catchup-added-${i}`, name: a.name.trim(), amount: n, type: a.type, recurrence: "none", startDate: a.date, autopay: false, reminder: false, tags: "", highlight: "", note: "" });
    });
    loans.forEach((l, i) => l.chunks.forEach((c, j) => {
      transactions.push({ id: `catchup-loan-${i}-${j}`, name: l.name, amount: c.amount, type: "expense", recurrence: "none", startDate: c.date, autopay: false, reminder: false, tags: "debt", highlight: "", note: "" });
    }));
    return { ...state, overrides, transactions };
  }, [state, events, added, loans]);

  // The next 60 days as the debt spreader expects them, so a loan can be
  // split across upcoming paydays.
  const futurePoints = useMemo<DailyPoint[]>(() => {
    const to = addDays(today, 60);
    const occs = occurrencesBetween(state, today, to);
    return dailyBalances(state, to).filter((d) => d.date >= today).map((d) => ({
      date: d.date,
      balance: d.bal,
      transactions: occs.filter((o) => o.date === d.date).map((o) => ({ type: o.type, amount: o.amount })),
    }));
  }, [state, today]);

  function addLoan() {
    const n = parseFloat(loanDraft.amount);
    if (!loanDraft.name.trim() || isNaN(n) || n <= 0) return;
    const chunks = distributeDebt(n, futurePoints, { today });
    if (!chunks.length) return;
    setLoans((p) => [...p, { name: `Repay ${loanDraft.name.trim()}`, amount: n, chunks }]);
    setLoanDraft({ name: "", amount: "" });
  }

  const forecastToday = useMemo(() => balanceOn(correctedState, today), [correctedState, today]);
  const reconciled = useMemo(() => (bank ? reconcile(bank, correctedState) : null), [bank, correctedState]);
  const actualNum = actual.trim() !== "" ? parseFloat(actual) : reconciled ? reconciled.balance : NaN;
  const haveActual = !isNaN(actualNum);

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(file);
    });
  }

  async function addBank(fetchBank: () => Promise<BankData>) {
    setBankBusy(true); setBankErr("");
    try {
      const parsed = await fetchBank();
      setBank((prev) => ({ accounts: [...(prev?.accounts || []), ...(parsed.accounts || [])], transactions: [...(prev?.transactions || []), ...(parsed.transactions || [])] }));
    } catch (e) {
      setBankErr(e instanceof Error && e.message ? e.message : "Could not read that file. Try another screenshot or a CSV.");
    } finally { setBankBusy(false); }
  }

  async function onImages(files: FileList) {
    const arr = Array.from(files).slice(0, 6);
    if (!arr.length) return;
    await addBank(async () => {
      const images = await Promise.all(arr.map(async (f) => ({ base64: await fileToBase64(f), mediaType: f.type || "image/png" })));
      const res = await api("/api/reconcile/image", { method: "POST", body: JSON.stringify({ images }) });
      if (res.error) throw new Error(String(res.error));
      return res as unknown as BankData;
    });
  }

  async function onCsv(file: File) {
    const text = await file.text();
    await addBank(async () => {
      const res = await api("/api/reconcile/csv", { method: "POST", body: JSON.stringify({ csv: text }) });
      if (res.error) throw new Error(String(res.error));
      return res as unknown as BankData;
    });
  }

  async function goToVerdict() {
    if (!haveActual) return;
    const o = outlookAfter(correctedState, today, actualNum, 45);
    setOutlook(o);
    setStep(4);
    setNoteBusy(true); setNote("");
    const g = guess.trim() !== "" ? parseFloat(guess) : null;
    const facts = {
      gapDays,
      guess: g != null && !isNaN(g) ? g : null,
      forecastToday: Math.round(forecastToday * 100) / 100,
      actual: Math.round(actualNum * 100) / 100,
      delta: Math.round((actualNum - forecastToday) * 100) / 100,
      confirmed: {
        happened: events.filter((e) => e.status === "happened").length,
        skipped: events.filter((e) => e.status === "skipped").length,
        changed: events.filter((e) => e.status === "changed").length,
        added: added.filter((a) => a.name.trim() && parseFloat(a.amount) > 0).length,
        loans: loans.map((l) => ({ name: l.name, amount: l.amount, chunks: l.chunks.length })),
      },
      lowest: o.lowest,
      negativeDays: o.negativeDays,
      nextIncome: o.nextIncome ? { date: o.nextIncome.date, name: o.nextIncome.name, amount: o.nextIncome.amount } : null,
      bigUpcoming: o.bigUpcoming.map((b) => ({ date: b.date, name: b.name, amount: b.amount })),
      endOfWindow: o.endOfWindow,
      windowDays: o.windowDays,
      today,
    };
    try {
      const res = await api("/api/catchup", { method: "POST", body: JSON.stringify({ facts, demo }) });
      setNote(typeof res.note === "string" ? res.note : "");
    } catch { setNote(""); } finally { setNoteBusy(false); }
  }

  async function apply() {
    if (!haveActual || applying) return;
    setApplying(true);
    let writes = 0;
    try {
      for (const e of events) {
        const key = { transactionId: e.txId, occurrenceDate: e.occurrenceDate };
        if (e.status === "skipped") { await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ ...key, deleted: true }) }); writes++; }
        else if (e.status === "changed") {
          const n = parseFloat(e.newAmount);
          if (!isNaN(n) && n >= 0 && n !== e.amount) { await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ ...key, amount: n }) }); writes++; }
        }
      }
      for (const a of added) {
        const n = parseFloat(a.amount);
        if (!a.name.trim() || isNaN(n) || n <= 0 || !a.date) continue;
        await callApi("/api/transactions", { method: "POST", body: JSON.stringify({ name: a.name.trim(), amount: n, type: a.type, recurrence: "none", startDate: a.date }) });
        writes++;
      }
      for (const l of loans) {
        for (const c of l.chunks) {
          await callApi("/api/transactions", { method: "POST", body: JSON.stringify({ name: l.name, amount: c.amount, type: "expense", recurrence: "none", startDate: c.date, tags: "debt" }) });
          writes++;
        }
      }
      // Future-scheduled items the bank shows already cleared: move them onto
      // the posted date so they are not counted twice after the reset.
      if (reconciled) {
        for (const m of reconciled.moved) {
          await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: m.txId, occurrenceDate: m.occurrenceDate, movedTo: m.to }) });
          writes++;
        }
      }
      await callApi("/api/balance-resets", { method: "POST", body: JSON.stringify({ date: today, amount: Math.round(actualNum * 100) / 100 }) });
      writes++;
      await reload();
      onApplied?.();
      setDone(`Calendar is current as of ${friendlyDate(today)}. ${writes} change${writes === 1 ? "" : "s"} saved.`);
      setStep(5);
    } finally { setApplying(false); }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const primary: React.CSSProperties = { width: "100%", padding: "14px", borderRadius: 12, border: "none", background: th.headerBg, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const secondary: React.CSSProperties = { padding: "12px 16px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 };
  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", fontSize: 18, padding: "14px 16px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontFamily: "inherit", outline: "none" };
  const pill = (on: boolean, color = th.headerBg): React.CSSProperties => ({ padding: "6px 10px", borderRadius: 999, border: `1.5px solid ${on ? color : "#e2e8f0"}`, background: on ? color : "#fff", color: on ? "#fff" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

  const guessNum = parseFloat(guess);
  const guessOff = !isNaN(guessNum) && haveActual ? guessNum - actualNum : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, animation: "panelIn 0.18s ease" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "28px 28px 24px", width: 520, maxWidth: "94vw", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", color: "#0f172a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>Catch up</span>
          <button onClick={onClose} className="bf-btn" style={{ border: "none", background: "none", fontSize: 22, color: "#94a3b8", cursor: "pointer", padding: "2px 6px" }} aria-label="Close">×</button>
        </div>

        {step < 5 && (
          <div style={{ display: "flex", gap: 6, margin: "10px 0 22px" }}>
            {STEPS.map((s, i) => (
              <div key={s} title={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? th.headerBg : "#e2e8f0" }} />
            ))}
          </div>
        )}

        {step === 0 && (
          <>
            <p style={{ fontSize: 15, lineHeight: 1.55, margin: "0 0 10px" }}>
              {gapDays > 0 ? <>It has been <strong>{gapDays} day{gapDays === 1 ? "" : "s"}</strong> since the calendar last had a real balance.</> : <>Let&rsquo;s check the calendar against your bank.</>} That is normal. The calendar kept going without you, and the point of this is to find out how far off it is, in about two minutes.
            </p>
            <ol style={{ margin: "0 0 20px", paddingLeft: 20, fontSize: 14, color: "#475569", lineHeight: 1.7 }}>
              <li>Guess your balance before you look.</li>
              <li>Confirm the big things that happened since {friendlyDate(from)}.</li>
              <li>Enter the real balance, or snap a bank screenshot.</li>
              <li>Read where you actually stand for the next 45 days.</li>
            </ol>
            <button onClick={() => setStep(1)} style={primary}>Start</button>
          </>
        )}

        {step === 1 && (
          <>
            <p style={{ fontSize: 15, lineHeight: 1.55, margin: "0 0 14px" }}>
              Before you look at the bank: what do you think is in checking right now? A rough number is fine. This is for you, not a test.
            </p>
            <label style={label}>My guess</label>
            <input autoFocus type="number" step="1" inputMode="decimal" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="0" style={input}
              onKeyDown={(e) => { if (e.key === "Enter") setStep(2); }} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setStep(2)} style={primary}>{guess.trim() ? "Lock it in" : "Skip the guess"}</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p style={{ fontSize: 15, lineHeight: 1.55, margin: "0 0 12px" }}>
              These are the larger items the calendar expected between {friendlyDate(from)} and today. Mark anything that did not happen or came in at a different amount.
            </p>
            {events.length === 0 && <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 12px" }}>Nothing large was scheduled in that window.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {events.map((e, i) => (
                <div key={`${e.txId}:${e.occurrenceDate}`} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 12px", opacity: e.status === "skipped" ? 0.6 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, textDecoration: e.status === "skipped" ? "line-through" : "none" }}>{e.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: e.type === "income" ? "#047857" : "#b91c1c", fontVariantNumeric: "tabular-nums" }}>{e.type === "income" ? "+" : "-"}{fmt(e.amount)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{friendlyDate(e.date)}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <button style={pill(e.status === "happened")} onClick={() => setEvents((p) => p.map((x, j) => (j === i ? { ...x, status: "happened" } : x)))}>Happened</button>
                    <button style={pill(e.status === "skipped", "#64748b")} onClick={() => setEvents((p) => p.map((x, j) => (j === i ? { ...x, status: "skipped" } : x)))}>Didn&rsquo;t happen</button>
                    <button style={pill(e.status === "changed", "#b45309")} onClick={() => setEvents((p) => p.map((x, j) => (j === i ? { ...x, status: "changed" } : x)))}>Different amount</button>
                    {e.status === "changed" && (
                      <input type="number" step="0.01" inputMode="decimal" value={e.newAmount} onChange={(ev) => setEvents((p) => p.map((x, j) => (j === i ? { ...x, newAmount: ev.target.value } : x)))}
                        style={{ width: 110, padding: "6px 8px", borderRadius: 8, border: "1.5px solid #fcd34d", fontSize: 13, fontFamily: "inherit" }} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ border: `1.5px dashed ${th.accent}`, borderRadius: 12, padding: "10px 12px", marginBottom: 16, background: th.totalBg }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Anything big that is not on the calendar?</div>
              {added.map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span>{a.name} · {friendlyDate(a.date)}</span>
                  <span style={{ fontWeight: 700, color: a.type === "income" ? "#047857" : "#b91c1c" }}>{a.type === "income" ? "+" : "-"}{fmt(parseFloat(a.amount) || 0)}
                    <button onClick={() => setAdded((p) => p.filter((_, j) => j !== i))} style={{ marginLeft: 8, border: "none", background: "none", color: "#94a3b8", cursor: "pointer" }} aria-label="Remove">×</button>
                  </span>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 6, marginTop: 6 }}>
                <input placeholder="What was it" value={addDraft.name} onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} style={{ ...input, fontSize: 13, padding: "8px 10px" }} />
                <input placeholder="Amount" type="number" step="0.01" inputMode="decimal" value={addDraft.amount} onChange={(e) => setAddDraft({ ...addDraft, amount: e.target.value })} style={{ ...input, fontSize: 13, padding: "8px 10px" }} />
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button style={pill(addDraft.type === "expense", "#b91c1c")} onClick={() => setAddDraft({ ...addDraft, type: "expense" })}>Expense</button>
                  <button style={pill(addDraft.type === "income", "#047857")} onClick={() => setAddDraft({ ...addDraft, type: "income" })}>Income</button>
                  <input type="date" value={addDraft.date} max={today} onChange={(e) => setAddDraft({ ...addDraft, date: e.target.value })} style={{ ...input, fontSize: 12, padding: "6px 8px", width: "auto" }} />
                </div>
                <button onClick={() => { if (addDraft.name.trim() && parseFloat(addDraft.amount) > 0) { setAdded((p) => [...p, addDraft]); setAddDraft({ name: "", amount: "", type: "expense", date: today }); } }}
                  style={{ ...secondary, padding: "8px 10px", fontSize: 13, color: th.headerBg, borderColor: th.accent }}>Add</button>
              </div>
            </div>

            <div style={{ border: `1.5px dashed ${th.accent}`, borderRadius: 12, padding: "10px 12px", marginBottom: 16, background: th.totalBg }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Any loans that need to be repaid?</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, lineHeight: 1.4 }}>Money you borrowed and still owe. If it landed in your account, it is already in today&rsquo;s balance; this only schedules paying it back, split across your next paydays.</div>
              {loans.map((l, i) => (
                <div key={i} style={{ fontSize: 13, padding: "6px 0", borderTop: i ? "1px solid #e2e8f0" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600 }}>{l.name}</span>
                    <span style={{ fontWeight: 700, color: "#b91c1c" }}>-{fmt(l.amount)}
                      <button onClick={() => setLoans((p) => p.filter((_, j) => j !== i))} style={{ marginLeft: 8, border: "none", background: "none", color: "#94a3b8", cursor: "pointer" }} aria-label="Remove">×</button>
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{l.chunks.map((c) => `${fmt(c.amount)} on ${friendlyDate(c.date)}`).join(" · ")}</div>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: 6, marginTop: 6 }}>
                <input placeholder="Who or what (e.g. Mom, credit line)" value={loanDraft.name} onChange={(e) => setLoanDraft({ ...loanDraft, name: e.target.value })} style={{ ...input, fontSize: 13, padding: "8px 10px" }}
                  onKeyDown={(e) => { if (e.key === "Enter") addLoan(); }} />
                <input placeholder="Owed" type="number" step="0.01" inputMode="decimal" value={loanDraft.amount} onChange={(e) => setLoanDraft({ ...loanDraft, amount: e.target.value })} style={{ ...input, fontSize: 13, padding: "8px 10px" }}
                  onKeyDown={(e) => { if (e.key === "Enter") addLoan(); }} />
                <button onClick={addLoan} style={{ ...secondary, padding: "8px 10px", fontSize: 13, color: th.headerBg, borderColor: th.accent }}>Spread it</button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep(1)} style={secondary}>Back</button>
              <button onClick={() => setStep(3)} style={primary}>Continue</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p style={{ fontSize: 15, lineHeight: 1.55, margin: "0 0 6px" }}>
              Now the real number. Open your bank and type today&rsquo;s balance, or snap a screenshot of the accounts screen and let it be read for you.
            </p>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>
              After your corrections, the calendar expects <strong style={{ color: "#0f172a" }}>{fmt(forecastToday)}</strong> today{guess.trim() ? <>; you guessed <strong style={{ color: "#0f172a" }}>{fmt(guessNum || 0)}</strong></> : null}.
            </p>
            <label style={label}>Actual balance today</label>
            <input autoFocus type="number" step="0.01" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} placeholder={reconciled ? String(reconciled.balance) : "0.00"} style={input}
              onKeyDown={(e) => { if (e.key === "Enter" && haveActual) goToVerdict(); }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <label className="bf-btn" style={{ ...secondary, flex: 1, textAlign: "center", color: th.headerBg, borderColor: th.accent, background: th.totalBg, cursor: bankBusy ? "wait" : "pointer", opacity: bankBusy ? 0.6 : 1 }}>
                Snap from photo
                <input type="file" accept="image/*" multiple hidden disabled={bankBusy} onChange={async (e) => { if (e.target.files?.length) await onImages(e.target.files); e.target.value = ""; }} />
              </label>
              <label className="bf-btn" style={{ ...secondary, flex: 1, textAlign: "center", color: th.headerBg, borderColor: th.accent, background: th.totalBg, cursor: bankBusy ? "wait" : "pointer", opacity: bankBusy ? 0.6 : 1 }}>
                Import CSV
                <input type="file" accept=".csv" hidden disabled={bankBusy} onChange={async (e) => { const f = e.target.files?.[0]; if (f) await onCsv(f); e.target.value = ""; }} />
              </label>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, lineHeight: 1.4 }}>Screenshots and CSVs are read by AI (Anthropic Claude) to pull out the balance. The file itself is not saved.</div>
            {bankBusy && <div style={{ fontSize: 13, color: "#64748b", marginTop: 10 }}>Reading your statement…</div>}
            {bankErr && <div style={{ fontSize: 13, color: "#b91c1c", marginTop: 10 }}>{bankErr}</div>}
            {reconciled && !bankBusy && (
              <div style={{ marginTop: 10, padding: "10px 12px", background: th.totalBg, border: `1px solid ${th.accent}55`, borderRadius: 10, fontSize: 13 }}>
                Read a balance of <strong>{fmt(reconciled.balance)}</strong>{reconciled.moved.length ? <>, and {reconciled.moved.length} scheduled item{reconciled.moved.length === 1 ? " has" : "s have"} already cleared (they will be moved onto the day they posted)</> : null}. Leave the box empty to use it, or type a number to override.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setStep(2)} style={secondary}>Back</button>
              <button onClick={goToVerdict} disabled={!haveActual} style={{ ...primary, background: haveActual ? th.headerBg : "#cbd5e1", cursor: haveActual ? "pointer" : "not-allowed" }}>Show me where I stand</button>
            </div>
          </>
        )}

        {step === 4 && outlook && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
              <Stat label="You guessed" value={!isNaN(guessNum) ? fmt(guessNum) : "—"} sub={guessOff != null ? `${guessOff >= 0 ? "+" : "-"}${fmt(Math.abs(guessOff))} off` : ""} />
              <Stat label="Plan said" value={fmt(forecastToday)} sub={`${actualNum - forecastToday >= 0 ? "+" : "-"}${fmt(Math.abs(actualNum - forecastToday))} vs real`} />
              <Stat label="Real today" value={fmt(actualNum)} strong color={th.headerBg} />
            </div>

            <div style={{ borderRadius: 14, padding: "14px 16px", background: outlook.lowestIsNegative ? "#fff7ed" : th.totalBg, border: `1.5px solid ${outlook.lowestIsNegative ? "#fdba74" : th.accent}`, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: outlook.lowestIsNegative ? "#c2410c" : th.headerBg, marginBottom: 6 }}>
                {outlook.lowestIsNegative ? `Tight spot ahead` : `Next ${outlook.windowDays} days look fine`}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                Lowest point: <strong>{fmt(outlook.lowest.bal)}</strong> on {friendlyDate(outlook.lowest.date)}.
                {outlook.nextIncome && <> Next income: <strong>{fmt(outlook.nextIncome.amount)}</strong> on {friendlyDate(outlook.nextIncome.date)}.</>}
                {" "}Ends the window at <strong>{fmt(outlook.endOfWindow.bal)}</strong>.
              </div>
              {outlook.bigUpcoming.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: "#475569" }}>
                  Biggest items coming: {outlook.bigUpcoming.map((b) => `${b.name} ${fmt(b.amount)} (${friendlyDate(b.date)})`).join(", ")}.
                </div>
              )}
            </div>

            <div style={{ minHeight: 60, fontSize: 15, lineHeight: 1.6, marginBottom: 18 }}>
              {noteBusy ? <span style={{ color: "#94a3b8" }}>Putting this in plain words…</span> : note}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep(3)} style={secondary} disabled={applying}>Back</button>
              <button onClick={apply} disabled={applying} style={{ ...primary, opacity: applying ? 0.7 : 1 }}>{applying ? "Saving…" : "Apply and set today's balance"}</button>
            </div>
            <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 10, lineHeight: 1.45 }}>
              This saves a balance reset for today, marks the items you changed, and adds anything you typed in. Every piece can be undone from the calendar.
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0 14px" }}>
              <span style={{ width: 44, height: 44, borderRadius: "50%", background: th.headerBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
              <div style={{ fontSize: 16, fontWeight: 700 }}>You are caught up.</div>
            </div>
            <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.55, margin: "0 0 18px" }}>{done} The calendar now starts from the real number, and every day ahead is recomputed from it.</p>
            <button onClick={onClose} style={primary}>Back to the calendar</button>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, strong, color }: { label: string; value: string; sub?: string; strong?: boolean; color?: string }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8" }}>{label}</div>
      <div style={{ fontSize: strong ? 20 : 17, fontWeight: 800, color: color || "#0f172a", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}
