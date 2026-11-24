import type { AppState, OverrideData, Transaction } from "@/lib/types";

// Pure helpers for the "Catch up" flow: what happened while the user was away,
// what the plan says today's balance should be, and what the next weeks look
// like once the real balance is known. No React, no fetch, so it is testable.

export function dkey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export function pdk(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}
export function todayKey() {
  const d = new Date();
  return dkey(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(s: string, n: number) {
  const { year, month, day } = pdk(s);
  const d = new Date(year, month, day);
  d.setDate(d.getDate() + n);
  return dkey(d.getFullYear(), d.getMonth(), d.getDate());
}
export function daysBetween(a: string, b: string) {
  const da = new Date(pdk(a).year, pdk(a).month, pdk(a).day).getTime();
  const db = new Date(pdk(b).year, pdk(b).month, pdk(b).day).getTime();
  return Math.round((db - da) / 86400000);
}

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
  while (cur <= end && i < 1000) {
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

export interface Occ {
  txId: string;
  occurrenceDate: string; // original date, the override key
  date: string; // displayed date after any move
  name: string;
  amount: number; // absolute
  type: "income" | "expense";
  recurrence: string;
}

// Every planned occurrence whose displayed date falls in [from, to], with the
// override layer applied exactly like the dashboard.
export function occurrencesBetween(state: AppState, from: string, to: string): Occ[] {
  const out: Occ[] = [];
  // Expand a little wider than the window so items moved into it are caught.
  const lo = addDays(from, -45);
  const hi = addDays(to, 45);
  (state.transactions || []).forEach((tx: Transaction) => {
    getOccurrences(tx.startDate, tx.recurrence, lo, hi, tx.endDate).forEach((odk) => {
      const ov = state.overrides[`${tx.id}::${odk}`] as OverrideData | undefined;
      if (ov?.deleted) return;
      const date = ov?.movedTo || odk;
      if (date < from || date > to) return;
      out.push({
        txId: tx.id,
        occurrenceDate: odk,
        date,
        name: ov?.name ?? tx.name,
        amount: Math.abs(ov?.amount ?? tx.amount),
        type: ((ov?.type ?? tx.type) === "income" ? "income" : "expense"),
        recurrence: tx.recurrence,
      });
    });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

export interface DayBal { date: string; bal: number }

// Daily closing balances from the earliest transaction through `to`, honouring
// balance resets. `extraResets` lets the caller try a hypothetical reset
// (for example "what if today's real balance is X") without saving it.
export function dailyBalances(state: AppState, to: string, extraResets: Record<string, number> = {}): DayBal[] {
  const resets = { ...(state.balanceResets || {}), ...extraResets };
  const starts = (state.transactions || []).map((t) => t.startDate).filter(Boolean).sort();
  const resetDates = Object.keys(resets).sort();
  const first = [starts[0], resetDates[0]].filter(Boolean).sort()[0] || todayKey();
  const from = first < to ? first : to;
  const occs = occurrencesBetween(state, from, to);
  const byDay: Record<string, number> = {};
  occs.forEach((o) => { byDay[o.date] = (byDay[o.date] || 0) + (o.type === "income" ? o.amount : -o.amount); });
  const out: DayBal[] = [];
  let bal = state.startingBalance || 0;
  const n = daysBetween(from, to);
  for (let i = 0; i <= n; i++) {
    const dk = addDays(from, i);
    if (resets[dk] !== undefined) bal = resets[dk];
    if (byDay[dk]) bal += byDay[dk];
    out.push({ date: dk, bal: Math.round(bal * 100) / 100 });
  }
  return out;
}

export function balanceOn(state: AppState, date: string, extraResets: Record<string, number> = {}) {
  const days = dailyBalances(state, date, extraResets);
  return days.length ? days[days.length - 1].bal : state.startingBalance || 0;
}

// The most recent date the user told us a real balance.
export function lastResetDate(state: AppState): string | null {
  const ds = Object.keys(state.balanceResets || {}).sort();
  return ds.length ? ds[ds.length - 1] : null;
}

// Items in the gap big enough to be worth confirming one by one. Threshold is
// relative to the user's own numbers so a $40 item is "large" for a small
// budget and ignored in a big one.
export function largeGapEvents(state: AppState, from: string, to: string, maxItems = 12): Occ[] {
  const occs = occurrencesBetween(state, from, to);
  if (!occs.length) return [];
  const amounts = occs.map((o) => o.amount).sort((a, b) => a - b);
  const median = amounts[Math.floor(amounts.length / 2)] || 0;
  const threshold = Math.max(50, median);
  const big = occs.filter((o) => o.amount >= threshold);
  return big.sort((a, b) => b.amount - a.amount).slice(0, maxItems).sort((a, b) => a.date.localeCompare(b.date));
}

export interface Outlook {
  lowest: DayBal;
  lowestIsNegative: boolean;
  negativeDays: number;
  nextIncome: Occ | null;
  bigUpcoming: Occ[];
  endOfWindow: DayBal;
  windowDays: number;
}

// What the next `windowDays` look like once today's balance is `actual`.
export function outlookAfter(state: AppState, today: string, actual: number, windowDays = 45): Outlook {
  const to = addDays(today, windowDays);
  const days = dailyBalances(state, to, { [today]: actual }).filter((d) => d.date >= today);
  const lowest = days.reduce((m, d) => (d.bal < m.bal ? d : m), days[0]);
  const upcoming = occurrencesBetween(state, addDays(today, 1), to);
  const nextIncome = upcoming.find((o) => o.type === "income") || null;
  const bigUpcoming = upcoming.filter((o) => o.type === "expense").sort((a, b) => b.amount - a.amount).slice(0, 4).sort((a, b) => a.date.localeCompare(b.date));
  return {
    lowest,
    lowestIsNegative: lowest.bal < 0,
    negativeDays: days.filter((d) => d.bal < 0).length,
    nextIncome,
    bigUpcoming,
    endOfWindow: days[days.length - 1],
    windowDays,
  };
}
