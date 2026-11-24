"use client";

import { useEffect, useState } from "react";
import type { AppState } from "@/lib/types";
import { addDays, dailyBalances, occurrencesBetween, todayKey } from "@/lib/catchup";

// Fills the {{...}} spans in an article with the signed-in reader's own
// numbers. Signed out (401) leaves the sample numbers and says so.

function fmt(n: number) {
  const s = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (n < 0 ? "-$" : "$") + s;
}
function nice(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function FillNumbers() {
  const [mode, setMode] = useState<"loading" | "mine" | "sample">("loading");
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch("/api/state");
        if (!r.ok) { if (!dead) setMode("sample"); return; }
        const state = (await r.json()) as AppState;
        if (!state?.transactions?.length) { if (!dead) setMode("sample"); return; }
        const today = todayKey();
        const ahead = dailyBalances(state, addDays(today, 45)).filter((d) => d.date >= today);
        const lowest = ahead.reduce((m, d) => (d.bal < m.bal ? d : m), ahead[0]);
        const income = occurrencesBetween(state, addDays(today, 1), addDays(today, 45)).find((o) => o.type === "income");
        const past = dailyBalances(state, today).filter((d) => d.date <= today).reverse();
        let streak = 0; for (const d of past) { if (d.bal >= 0) streak++; else break; }
        const vals: Record<string, string> = {
          lowest: fmt(lowest.bal),
          lowestDate: nice(lowest.date),
          lowestVerdict: lowest.bal >= 0 ? "It is above zero, so the next few weeks are handled." : "It is below zero, which is a problem on a specific day, and a specific day is something you can move things around.",
          nextIncome: income ? fmt(income.amount) : "no income scheduled",
          nextIncomeDate: income ? nice(income.date) : "the next 45 days",
          greenDays: String(streak),
        };
        document.querySelectorAll<HTMLElement>("[data-fill]").forEach((el) => {
          const k = el.dataset.fill || "";
          if (vals[k] != null) el.textContent = vals[k];
        });
        if (!dead) setMode("mine");
      } catch { if (!dead) setMode("sample"); }
    })();
    return () => { dead = true; };
  }, []);

  if (mode === "loading") return <div className="fillnote">Reading your calendar…</div>;
  if (mode === "mine") return <div className="fillnote">The highlighted numbers below are yours, from your calendar right now.</div>;
  return (
    <div className="fillnote">
      <span>The highlighted numbers are sample figures. Sign in and this article reads from your own calendar.</span>
      <a href="/app">See yours</a>
    </div>
  );
}
