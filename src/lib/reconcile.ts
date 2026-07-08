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

// Produce the { balance, date, moved, unaccounted } shape the snap preview expects.
export function reconcile(bank: BankData, state: AppState): ReconcileResult {
  const today = todayKey();
  const accounts = bank.accounts || [];
  const transactions = (bank.transactions || []).slice().sort((a, b) => a.date.localeCompare(b.date));

  // Balance to snap to: authoritative account summary if present, else the last
  // known running balance from a transaction list.
  let balance = 0;
  if (accounts.length > 0) {
    balance = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  } else {
    const withRunning = transactions.filter((t) => t.runningBalance != null);
    if (withRunning.length > 0) balance = Number(withRunning[withRunning.length - 1].runningBalance) || 0;
  }
  balance = Math.round(balance * 100) / 100;

  const moved: SnapMoved[] = [];
  const unaccounted: SnapUnaccounted[] = [];

  if (transactions.length === 0) {
    return { balance, date: today, moved, unaccounted };
  }

  // Window generously around the bank transactions and today so we catch a
  // planned item whose posting date drifted a few weeks either way.
  const dates = transactions.map((t) => t.date).concat(today).sort();
  const rStart = addDays(dates[0], -31);
  const rEnd = addDays(dates[dates.length - 1], 31);
  const planned = plannedOccurrences(state, rStart, rEnd);
  const consumed = new Set<number>();

  for (const bt of transactions) {
    const bankType = bt.amount < 0 ? "expense" : "income";
    const bankMag = Math.abs(bt.amount);

    let bestIdx = -1;
    let bestDelta = Infinity;
    planned.forEach((p, idx) => {
      if (consumed.has(idx)) return;
      if (p.type !== bankType) return;
      if (!amountMatches(p.amount, bankMag)) return;
      if (!nameSimilar(p.name, bt.name)) return;
      const delta = Math.abs(pdkDiff(p.date, bt.date));
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = idx;
      }
    });

    if (bestIdx === -1) {
      unaccounted.push({ name: bt.name, amount: Math.round(bankMag * 100) / 100, type: bankType, date: bt.date });
      continue;
    }

    consumed.add(bestIdx);
    const p = planned[bestIdx];
    if (p.date !== bt.date) {
      moved.push({ name: p.name, from: p.date, to: bt.date, amount: Math.round(bankMag * 100) / 100 });
    }
  }

  return { balance, date: today, moved, unaccounted };
}

function pdkDiff(a: string, b: string) {
  const da = new Date(pdk(a).year, pdk(a).month, pdk(a).day).getTime();
  const db = new Date(pdk(b).year, pdk(b).month, pdk(b).day).getTime();
  return Math.round((da - db) / 86400000);
}
