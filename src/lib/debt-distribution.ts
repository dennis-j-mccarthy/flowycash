export interface DebtPlacement {
  date: string; // YYYY-MM-DD
  amount: number;
}

export interface DailyPoint {
  date: string;
  balance: number;
  transactions?: { type: string; amount: number }[];
}

export const SAFE_FLOOR = 0;

interface Opts {
  safeFloor?: number;
  today?: string;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Pick 2-4 future dates to spread a debt repayment across, preferring paydays
// (income >= $1000). Amounts are split roughly evenly with the last chunk
// absorbing the rounding remainder.
export function distributeDebt(amount: number, data: DailyPoint[], opts?: Opts): DebtPlacement[] {
  const today = opts?.today || todayKey();
  if (!(amount > 0)) return [];

  const future = (data || []).filter((d) => d.date >= today);
  if (future.length === 0) return [];

  const paydays = future
    .filter((d) => (d.transactions || []).some((t) => t.type === "income" && Math.abs(t.amount) >= 1000))
    .map((d) => d.date);

  const chosen: string[] = [];
  // Prefer paydays (up to 4).
  for (const p of paydays) {
    if (chosen.length >= 4) break;
    chosen.push(p);
  }
  // Fall back to evenly-spaced future dates if we don't have at least two anchors.
  if (chosen.length < 2 && future.length > 0) {
    const target = Math.min(4, Math.max(2, Math.min(future.length, 4)));
    const step = (future.length - 1) / Math.max(1, target - 1);
    for (let i = 0; i < target && chosen.length < 4; i++) {
      const idx = Math.round(i * step);
      const date = future[Math.min(idx, future.length - 1)].date;
      if (!chosen.includes(date)) chosen.push(date);
    }
  }
  if (chosen.length === 0) return [];
  chosen.sort();

  const n = chosen.length;
  const per = round2(amount / n);
  const placements: DebtPlacement[] = chosen.map((date, i) =>
    i < n - 1 ? { date, amount: per } : { date, amount: round2(amount - per * (n - 1)) },
  );
  return placements;
}

// Project the lowest running balance after applying the placements, so the
// caller can warn when a repayment would push a day below the safe floor.
export function simulateDistribution(data: DailyPoint[], placements: DebtPlacement[], opts?: Opts): number {
  const today = opts?.today || todayKey();
  const byDate: Record<string, number> = {};
  placements.forEach((p) => {
    byDate[p.date] = (byDate[p.date] || 0) + p.amount;
  });
  let placed = 0;
  let min = Infinity;
  (data || [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((d) => {
      placed += byDate[d.date] || 0;
      if (d.date >= today) min = Math.min(min, d.balance - placed);
    });
  return min === Infinity ? 0 : round2(min);
}
