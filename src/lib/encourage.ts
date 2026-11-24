// The one-line encouragement pieces: a situation, one sentence, a link to the
// longer article. Each shows once per situation and stays dismissed for 30
// days on the device. Pure helpers; the dashboard decides which situation is
// live and renders the line.

import { addDays, dailyBalances, occurrencesBetween, todayKey } from "@/lib/catchup";
import type { AppState } from "@/lib/types";

export interface Encouragement {
  id: string;
  text: string;
  linkText: string;
  href: string;
}

const KEY = (id: string) => `flowycash-encourage-${id}`;
const DAYS = 30;

export function isDismissed(id: string): boolean {
  try {
    const v = localStorage.getItem(KEY(id));
    if (!v) return false;
    return Date.now() - Number(v) < DAYS * 86400000;
  } catch { return false; }
}
export function dismiss(id: string) {
  try { localStorage.setItem(KEY(id), String(Date.now())); } catch {}
}

function fmt(n: number) {
  const s = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (n < 0 ? "-$" : "$") + s;
}
function nice(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface Situation {
  lowest: { date: string; bal: number } | null;
  greenStreak: number; // consecutive days up to today with balance >= 0
  hasBank: boolean;
}

// Facts about the next 45 days and the recent past, computed once per render.
export function situation(state: AppState, hasBank: boolean): Situation {
  const today = todayKey();
  if (!state.transactions?.length) return { lowest: null, greenStreak: 0, hasBank };
  const ahead = dailyBalances(state, addDays(today, 45)).filter((d) => d.date >= today);
  const lowest = ahead.length ? ahead.reduce((m, d) => (d.bal < m.bal ? d : m), ahead[0]) : null;
  const past = dailyBalances(state, today).filter((d) => d.date <= today).reverse();
  let streak = 0;
  for (const d of past) { if (d.bal >= 0) streak++; else break; }
  return { lowest, greenStreak: streak, hasBank };
}

// The single most useful line right now, or null. Priority: a red day ahead,
// then the first bank sync, then a long green streak, then a clear window.
export function pickEncouragement(s: Situation, state: AppState): Encouragement | null {
  const candidates: Encouragement[] = [];
  if (s.lowest && s.lowest.bal < 0) {
    const days = Math.max(0, Math.round((new Date(s.lowest.date).getTime() - new Date(todayKey()).getTime()) / 86400000));
    candidates.push({
      id: "red-day",
      text: days > 2 ? `A red day ${days} days out is good news. You have ${days} days.` : `There is a red day close by. One move past payday usually clears it.`,
      linkText: "Why red days are a gift",
      href: "/blog/why-red-days-are-a-gift",
    });
  }
  if (s.hasBank) {
    candidates.push({ id: "bank-first", text: "Your bank now records the past. The calendar still owns the future.", linkText: "Two clocks", href: "/blog/two-clocks" });
  }
  if (s.greenStreak >= 30) {
    candidates.push({ id: "green-30", text: `${s.greenStreak} days in a row above zero. That is what a boring month looks like.`, linkText: "What a boring month means", href: "/blog/what-a-boring-month-means" });
  }
  if (s.lowest && s.lowest.bal >= 0) {
    candidates.push({ id: "clear-45", text: `The next 45 days are handled. The lowest point is ${fmt(s.lowest.bal)} on ${nice(s.lowest.date)}.`, linkText: "Find the lowest point, not the total", href: "/blog/find-the-lowest-point" });
  }
  // Nothing dated yet: point at placing.
  const upcoming = occurrencesBetween(state, todayKey(), addDays(todayKey(), 30)).length;
  if (upcoming < 3) {
    candidates.push({ id: "place-first", text: "Start with the next thirty days. Paychecks first, then anything over a hundred dollars.", linkText: "A bill without a day is a worry", href: "/blog/a-bill-without-a-day" });
  }
  return candidates.find((c) => !isDismissed(c.id)) || null;
}
