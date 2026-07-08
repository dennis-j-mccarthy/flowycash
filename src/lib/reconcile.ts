import type { AppState, OverrideData, Transaction } from "@/lib/types";

export interface BankAccount {
  name: string;
  last4: string;
  balance: number;
}

export interface BankTransaction {
  date: string; // YYYY-MM-DD
  name: string;
  amount: number; // signed: negative = debit/expense, positive = credit/income
  runningBalance: number | null;
}

export interface BankData {
  accounts?: BankAccount[];
  transactions?: BankTransaction[];
}

export interface SnapMoved {
  name: string;
  from: string;
  to: string;
  amount: number;
  txId: string;
  occurrenceDate: string;
}

export interface SnapUnaccounted {
  name: string;
  amount: number;
  type: string;
  date: string;
}

export interface ReconcileResult {
  balance: number;
  date: string;
  moved: SnapMoved[];
  unaccounted: SnapUnaccounted[];
}

function pdk(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}
function dkey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function addDays(s: string, n: number) {
  const { year, month, day } = pdk(s);
  const d = new Date(year, month, day);
  d.setDate(d.getDate() + n);
  return dkey(d.getFullYear(), d.getMonth(), d.getDate());
}
function todayKey() {
  const d = new Date();
  return dkey(d.getFullYear(), d.getMonth(), d.getDate());
}

// Expand one transaction's occurrence dates between rStart and rEnd (inclusive).
// Mirrors the generator used in the dashboard so matching stays consistent.
function getOccurrences(startDate: string, recurrence: string, rStart: string, rEnd: string, endDate?: string | null) {
  if (recurrence === "none") {
    if (endDate && startDate > endDate) return [];
    return startDate >= rStart && startDate <= rEnd ? [startDate] : [];
  }
  const effectiveEnd = endDate && endDate < rEnd ? endDate : rEnd;
  if (startDate > effectiveEnd) return [];
  const dates: string[] = [];
  const { year, month, day } = pdk(startDate);
  let cur = new Date(year, month, day);
  const end = new Date(pdk(effectiveEnd).year, pdk(effectiveEnd).month, pdk(effectiveEnd).day);
  const start = new Date(pdk(rStart).year, pdk(rStart).month, pdk(rStart).day);
  let i = 0;
  while (cur <= end && i < 500) {
    i++;
    if (cur >= start) dates.push(dkey(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    if (recurrence === "weekly") cur.setDate(cur.getDate() + 7);
    else if (recurrence === "biweekly") cur.setDate(cur.getDate() + 14);
    else if (recurrence === "monthly") cur = new Date(cur.getFullYear(), cur.getMonth() + 1, day);
    else if (recurrence === "yearly") cur = new Date(cur.getFullYear() + 1, month, day);
    else break;
  }
  return dates;
}

interface PlannedOccurrence {
  txId: string;
  occurrenceDate: string;
  date: string; // display date after any movedTo override
  name: string;
  amount: number; // absolute value
  type: string;
}

// Expand every transaction into its occurrences over the window, applying the
// override layer (deleted / movedTo / edited fields) exactly like the dashboard.
function plannedOccurrences(state: AppState, rStart: string, rEnd: string): PlannedOccurrence[] {
  const out: PlannedOccurrence[] = [];
  (state.transactions || []).forEach((tx: Transaction) => {
    const occs = getOccurrences(tx.startDate, tx.recurrence, rStart, rEnd, tx.endDate);
    occs.forEach((odk) => {
      const ov = state.overrides[`${tx.id}::${odk}`] as OverrideData | undefined;
      if (ov?.deleted) return;
      const date = ov?.movedTo || odk;
      out.push({
        txId: tx.id,
        occurrenceDate: odk,
        date,
        name: ov?.name ?? tx.name,
        amount: Math.abs(ov?.amount ?? tx.amount),
        type: ov?.type ?? tx.type,
      });
    });
  });
  return out;
}

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nameSimilar(a: string, b: string) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return true;
  // token overlap on words of 4+ chars (e.g. "Geico Insurance" vs "Geico")
  const ta = (a || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  const tb = (b || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  return ta.some((t) => tb.includes(t));
}

function amountMatches(planned: number, bankMag: number) {
  const tolerance = Math.max(1, bankMag * 0.02);
  return Math.abs(planned - bankMag) <= tolerance;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Produce the { balance, date, moved, unaccounted } shape the snap preview expects.
// The current balance is the point of the snapshot; matching only exists to catch
// future-scheduled items that already cleared (so they aren't counted twice after
// the balance is snapped). Nothing here is destructive.
export function reconcile(bank: BankData, state: AppState): ReconcileResult {
  const asOf = todayKey();
  const accounts = bank.accounts || [];
  const transactions = (bank.transactions || []).slice().sort((a, b) => a.date.localeCompare(b.date));

  // The headline: snap the forecast to the actual current balance — the
  // authoritative account summary if present, else the last running balance.
  let balance = 0;
  if (accounts.length > 0) {
    balance = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  } else {
    const withRunning = transactions.filter((t) => t.runningBalance != null);
    if (withRunning.length > 0) balance = Number(withRunning[withRunning.length - 1].runningBalance) || 0;
  }
  balance = round2(balance);

  const moved: SnapMoved[] = [];
  const unaccounted: SnapUnaccounted[] = [];
  if (transactions.length === 0) {
    return { balance, date: asOf, moved, unaccounted };
  }

  // Expand planned occurrences across the recent past and the near future so we
  // can spot future-scheduled items that have already cleared.
  const btDates = transactions.map((t) => t.date);
  const lo = btDates[0] < asOf ? btDates[0] : asOf;
  const hi = btDates[btDates.length - 1] > asOf ? btDates[btDates.length - 1] : asOf;
  const planned = plannedOccurrences(state, addDays(lo, -31), addDays(hi, 45));
  const consumed = new Set<number>();

  // A future-scheduled occurrence that a (past) bank charge already matches has
  // already happened — after we snap the balance it would be counted twice, so
  // propose MOVING it onto the date it actually posted (a reversible override;
  // never a delete).
  planned.forEach((p) => {
    if (p.date <= asOf) return; // only future occurrences can double-count post-reset
    let bestBank = -1;
    let bestDelta = Infinity;
    transactions.forEach((bt, bi) => {
      if (consumed.has(bi)) return;
      const bankType = bt.amount < 0 ? "expense" : "income";
      if (bankType !== p.type) return;
      if (!amountMatches(p.amount, Math.abs(bt.amount))) return;
      if (!nameSimilar(p.name, bt.name)) return;
      const delta = Math.abs(pdkDiff(bt.date, p.date));
      if (delta < bestDelta) { bestDelta = delta; bestBank = bi; }
    });
    if (bestBank >= 0) {
      const bt = transactions[bestBank];
      consumed.add(bestBank);
      moved.push({ name: p.name, from: p.date, to: bt.date, amount: round2(Math.abs(bt.amount)), txId: p.txId, occurrenceDate: p.occurrenceDate });
    }
  });

  // Charges that match no plan at all are informational only — they already
  // shaped the current balance, so we surface them without taking any action.
  transactions.forEach((bt, bi) => {
    if (consumed.has(bi)) return;
    const bankType = bt.amount < 0 ? "expense" : "income";
    const bankMag = Math.abs(bt.amount);
    const accounted = planned.some((p) => p.type === bankType && amountMatches(p.amount, bankMag) && nameSimilar(p.name, bt.name));
    if (accounted) return;
    unaccounted.push({ name: bt.name, amount: round2(bankMag), type: bankType, date: bt.date });
  });

  return { balance, date: asOf, moved, unaccounted };
}

function pdkDiff(a: string, b: string) {
  const da = new Date(pdk(a).year, pdk(a).month, pdk(a).day).getTime();
  const db = new Date(pdk(b).year, pdk(b).month, pdk(b).day).getTime();
  return Math.round((da - db) / 86400000);
}
