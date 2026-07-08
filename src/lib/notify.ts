import type { AppState, OverrideData, Transaction } from "@/lib/types";

// Server-safe formatting helpers, ported from the dashboard so email content
// reads the same as the UI without pulling in the client component.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmt(v: number) {
  const a = Math.abs(Math.round(v));
  const s = a.toLocaleString("en-US");
  return v < 0 ? `-$${s}` : `$${s}`;
}
export function friendlyDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${d}, ${y}`;
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

interface Occ {
  name: string;
  date: string; // display date (post-override)
  occurrenceDate: string;
  amount: number; // absolute
  type: string;
  autopay: boolean;
}

// Net signed amount bucketed by display date, applying the override layer.
function bucketByDate(state: AppState, rStart: string, rEnd: string): Record<string, number> {
  const buckets: Record<string, number> = {};
  (state.transactions || []).forEach((tx: Transaction) => {
    getOccurrences(tx.startDate, tx.recurrence, rStart, rEnd, tx.endDate).forEach((odk) => {
      const ov = state.overrides[`${tx.id}::${odk}`] as OverrideData | undefined;
      if (ov?.deleted) return;
      const disp = ov?.movedTo || odk;
      if (disp < rStart || disp > rEnd) return;
      const type = ov?.type ?? tx.type;
      const amount = Math.abs(ov?.amount ?? tx.amount);
      buckets[disp] = (buckets[disp] || 0) + (type === "income" ? amount : -amount);
    });
  });
  return buckets;
}

function expandOccurrences(state: AppState, rStart: string, rEnd: string): Occ[] {
  const out: Occ[] = [];
  (state.transactions || []).forEach((tx: Transaction) => {
    getOccurrences(tx.startDate, tx.recurrence, rStart, rEnd, tx.endDate).forEach((odk) => {
      const ov = state.overrides[`${tx.id}::${odk}`] as OverrideData | undefined;
      if (ov?.deleted) return;
      out.push({
        name: ov?.name ?? tx.name,
        date: ov?.movedTo || odk,
        occurrenceDate: odk,
        amount: Math.abs(ov?.amount ?? tx.amount),
        type: ov?.type ?? tx.type,
        autopay: !!tx.autopay,
      });
    });
  });
  return out;
}

// Forecast balance at `toDate`, starting from `fromBal` on `fromDate`.
function forecastBalanceAt(state: AppState, fromDate: string, fromBal: number, toDate: string): number {
  if (toDate <= fromDate) return fromBal;
  const buckets = bucketByDate(state, addDays(fromDate, 1), toDate);
  let bal = fromBal;
  const resets = state.balanceResets || {};
  let cur = addDays(fromDate, 1);
  while (cur <= toDate) {
    if (resets[cur] !== undefined) bal = resets[cur];
    bal += buckets[cur] || 0;
    cur = addDays(cur, 1);
  }
  return Math.round(bal * 100) / 100;
}

export interface DriftReport {
  today: string;
  upcomingLarge: { name: string; date: string; amount: number }[];
  overdue: { name: string; date: string; amount: number; type: string }[];
  negativeDays: { date: string; balance: number }[];
  dip: { date: string; deficit: number; tips: string[] } | null;
  resetDivergence: { from: string; to: string; predicted: number; actual: number; diff: number } | null;
  hasFindings: boolean;
}

// Concrete ways to offset a cashflow dip on `dipDate` (balance `dipBalance`).
// Prefers moving a movable (non-autopay) expense toward the next payday.
function dipTips(state: AppState, dipDate: string, dipBalance: number): string[] {
  const deficit = Math.round(Math.abs(dipBalance));
  const occs = expandOccurrences(state, addDays(dipDate, -31), addDays(dipDate, 45));
  const paydays = occs.filter((o) => o.type === "income" && o.amount >= 1000).map((o) => o.date).sort();
  const nextPay = paydays.find((d) => d > dipDate);
  const target = nextPay ? `${friendlyDate(nextPay)} (your next payday)` : `just after ${friendlyDate(dipDate)}`;

  const movable = occs
    .filter((o) => o.type === "expense" && !o.autopay && o.amount >= 50 && o.date <= dipDate)
    .sort((a, b) => b.amount - a.amount);

  const tips: string[] = [];
  const single = movable.find((o) => o.amount >= deficit);
  if (single) {
    tips.push(`Push ${single.name} (${fmt(single.amount)}, ${friendlyDate(single.date)}) to ${target} — that alone covers the ${fmt(deficit)} shortfall.`);
  } else if (movable[0]) {
    tips.push(`Move ${movable[0].name} (${fmt(movable[0].amount)}, ${friendlyDate(movable[0].date)}) to ${target} to free up cash before the dip.`);
  }
  if (movable[1] && !single) {
    tips.push(`Also consider shifting ${movable[1].name} (${fmt(movable[1].amount)}) later.`);
  }
  tips.push(`Or bring in / hold back about ${fmt(deficit)} before ${friendlyDate(dipDate)} — trim discretionary spending or pull income forward.`);
  return tips.slice(0, 3);
}

interface ReportOpts {
  today?: string;
  horizonDays?: number;
  largeMin?: number;
  leadDays?: number;
}

// Compare the current forecast against the last balance reset and surface drift:
// overdue planned items, upcoming negative days, and a big reset-to-reset gap.
export function buildDriftReport(state: AppState, opts?: ReportOpts): DriftReport {
  const today = opts?.today || todayKey();
  const horizon = opts?.horizonDays ?? 60;
  const largeMin = opts?.largeMin ?? 300;
  const leadDays = opts?.leadDays ?? 3;
  const resets = state.balanceResets || {};

  // --- Large payments coming due within the lead window ---
  const leadEnd = addDays(today, leadDays);
  const upcomingLarge = expandOccurrences(state, addDays(today, -3), addDays(leadEnd, 3))
    .filter((o) => o.type === "expense" && o.amount >= largeMin && o.date >= today && o.date <= leadEnd)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((o) => ({ name: o.name, date: o.date, amount: o.amount }));
  const resetDates = Object.keys(resets).sort();
  const pastResets = resetDates.filter((d) => d <= today);
  const lastResetDate = pastResets.length ? pastResets[pastResets.length - 1] : "";

  // --- Overdue: occurrences in the recent past not yet reconciled by a reset ---
  const overdue = expandOccurrences(state, addDays(today, -30), addDays(today, -1))
    .filter((o) => o.date < today && o.date > lastResetDate && o.type === "expense")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)
    .map((o) => ({ name: o.name, date: o.date, amount: o.amount, type: o.type }));

  // --- Negative forecast days from today forward ---
  // Anchor the walk on the latest past reset, else starting balance.
  let anchorDate: string;
  let anchorBal: number;
  if (lastResetDate) {
    anchorDate = lastResetDate;
    anchorBal = resets[lastResetDate];
  } else {
    const starts = (state.transactions || []).map((t) => t.startDate).filter(Boolean).sort();
    anchorDate = starts[0] && starts[0] < today ? starts[0] : today;
    anchorBal = state.startingBalance || 0;
  }
  const horizonEnd = addDays(today, horizon);
  const buckets = bucketByDate(state, anchorDate, horizonEnd);
  const negativeDays: { date: string; balance: number }[] = [];
  let bal = anchorBal;
  let cur = anchorDate;
  while (cur <= horizonEnd) {
    if (resets[cur] !== undefined) bal = resets[cur];
    bal += buckets[cur] || 0;
    const rounded = Math.round(bal * 100) / 100;
    if (cur >= today && rounded < 0) negativeDays.push({ date: cur, balance: rounded });
    cur = addDays(cur, 1);
  }

  // --- Reset divergence: did the forecast predict the latest reset well? ---
  let resetDivergence: DriftReport["resetDivergence"] = null;
  if (pastResets.length >= 2) {
    const prev = pastResets[pastResets.length - 2];
    const latest = pastResets[pastResets.length - 1];
    const predicted = forecastBalanceAt(state, prev, resets[prev], latest);
    const actual = resets[latest];
    const diff = Math.round((actual - predicted) * 100) / 100;
    if (Math.abs(diff) >= Math.max(500, Math.abs(actual) * 0.25)) {
      resetDivergence = { from: prev, to: latest, predicted, actual, diff };
    }
  }

  let dip: DriftReport["dip"] = null;
  if (negativeDays.length) {
    const worst = negativeDays.reduce((m, d) => (d.balance < m.balance ? d : m), negativeDays[0]);
    dip = { date: worst.date, deficit: Math.round(Math.abs(worst.balance)), tips: dipTips(state, worst.date, worst.balance) };
  }

  const hasFindings = upcomingLarge.length > 0 || overdue.length > 0 || negativeDays.length > 0 || resetDivergence != null;
  return { today, upcomingLarge, overdue, negativeDays, dip, resetDivergence, hasFindings };
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Turn a drift report into email content. Kept separate from sending so it can
// be previewed or unit-tested without a Resend key.
export function renderEmail(report: DriftReport): RenderedEmail {
  const subject = "Flowy Cash: heads up";
  const textLines: string[] = ["Here's what stood out in your forecast:", ""];
  const htmlSections: string[] = [];

  if (report.upcomingLarge.length) {
    const total = report.upcomingLarge.reduce((s, p) => s + p.amount, 0);
    textLines.push(`• Large payment${report.upcomingLarge.length === 1 ? "" : "s"} coming due: ` +
      report.upcomingLarge.map((p) => `${p.name} (${fmt(p.amount)}, ${friendlyDate(p.date)})`).join("; ") + ".");
    const items = report.upcomingLarge.map((p) => `<li>${escapeHtml(p.name)} — <strong>${fmt(p.amount)}</strong> due ${friendlyDate(p.date)}</li>`).join("");
    htmlSections.push(row("#7c3aed", `${report.upcomingLarge.length} large payment${report.upcomingLarge.length === 1 ? "" : "s"} due soon (${fmt(total)})`,
      `Make sure these are covered:<ul style="margin:8px 0 0;padding-left:18px;color:#334155;">${items}</ul>`));
  }

  if (report.negativeDays.length) {
    const first = report.negativeDays[0];
    const worst = report.negativeDays.reduce((m, d) => (d.balance < m.balance ? d : m), report.negativeDays[0]);
    const tips = report.dip?.tips || [];
    textLines.push(`• Cashflow dip: your balance goes negative on ${friendlyDate(first.date)} (down to ${fmt(worst.balance)} across ${report.negativeDays.length} day${report.negativeDays.length === 1 ? "" : "s"}).`);
    tips.forEach((t) => textLines.push(`    - ${t}`));
    const tipsHtml = tips.length
      ? `<div style="margin-top:8px;font-size:12px;font-weight:700;color:#334155;">Ways to offset it:</div>
         <ul style="margin:4px 0 0;padding-left:18px;color:#475569;font-size:12.5px;line-height:1.5;">${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
      : "";
    htmlSections.push(row("#ef4444", "Cashflow dip ahead",
      `Your balance is forecast to drop to <strong>${fmt(worst.balance)}</strong> on ${friendlyDate(worst.date)} (negative on ${report.negativeDays.length} day${report.negativeDays.length === 1 ? "" : "s"}).${tipsHtml}`));
  }

  if (report.overdue.length) {
    const total = report.overdue.reduce((s, o) => s + o.amount, 0);
    textLines.push(`• ${report.overdue.length} planned item${report.overdue.length === 1 ? "" : "s"} recently came due but your balance hasn't been reconciled since: ` +
      report.overdue.map((o) => `${o.name} (${fmt(o.amount)}, ${friendlyDate(o.date)})`).join("; ") + ".");
    const items = report.overdue.map((o) => `<li>${escapeHtml(o.name)} — <strong>${fmt(o.amount)}</strong> on ${friendlyDate(o.date)}</li>`).join("");
    htmlSections.push(row("#f59e0b", `${report.overdue.length} item${report.overdue.length === 1 ? "" : "s"} came due (${fmt(total)})`,
      `These planned items passed but your balance hasn't been snapped to reality since. Confirm they cleared:<ul style="margin:8px 0 0;padding-left:18px;color:#334155;">${items}</ul>`));
  }

  if (report.resetDivergence) {
    const d = report.resetDivergence;
    textLines.push(`• Your last balance reset (${fmt(d.actual)} on ${friendlyDate(d.to)}) diverged from the forecast (${fmt(d.predicted)}) by ${fmt(d.diff)}.`);
    htmlSections.push(row("#3b82f6", "Actuals drifted from forecast",
      `Your latest reset came in at <strong>${fmt(d.actual)}</strong>, but the forecast from ${friendlyDate(d.from)} predicted <strong>${fmt(d.predicted)}</strong> — a gap of <strong>${fmt(d.diff)}</strong>. Worth a look at what changed.`));
  }

  if (htmlSections.length === 0) {
    htmlSections.push(row("#10b981", "All clear", "Nothing needs your attention right now."));
    textLines.push("Nothing needs your attention right now.");
  }

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);">
    <div style="background:#065f46;padding:20px 24px;">
      <div style="color:#d1fae5;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;">Flowy Cash</div>
      <div style="color:#fff;font-size:20px;font-weight:800;margin-top:2px;">Heads up on your forecast</div>
    </div>
    <div style="padding:20px 24px;">${htmlSections.join("")}</div>
    <div style="padding:0 24px 22px;color:#94a3b8;font-size:12px;">Open Flowy Cash to review and adjust your plan.</div>
  </div></body></html>`;

  return { subject, html, text: textLines.join("\n") };
}

const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function dim(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

export interface MonthDashboard {
  monthLabel: string;
  today: string;
  currentBalance: number;
  totalIn: number;
  totalOut: number;
  low: { date: string; balance: number };
  end: { date: string; balance: number };
  negativeDaysAhead: number;
  upcoming: { name: string; date: string; amount: number; type: string; running: number }[];
}

// A Monday-morning snapshot of the current month: current balance, month totals,
// projected low/end, negative days ahead, and this week's payments.
export function buildMonthDashboard(state: AppState, opts?: { today?: string }): MonthDashboard {
  const today = opts?.today || todayKey();
  const { year: ty, month: tm } = pdk(today);
  const monthStart = dkey(ty, tm, 1);
  const monthEnd = dkey(ty, tm, dim(ty, tm));

  let totalIn = 0;
  let totalOut = 0;
  expandOccurrences(state, monthStart, monthEnd).forEach((o) => {
    if (o.date < monthStart || o.date > monthEnd) return;
    if (o.type === "income") totalIn += o.amount;
    else totalOut += o.amount;
  });

  const resets = state.balanceResets || {};
  const pastResets = Object.keys(resets).filter((d) => d <= today).sort();
  let anchorDate: string;
  let anchorBal: number;
  if (pastResets.length) {
    anchorDate = pastResets[pastResets.length - 1];
    anchorBal = resets[anchorDate];
  } else {
    const starts = (state.transactions || []).map((t) => t.startDate).filter(Boolean).sort();
    anchorDate = starts[0] && starts[0] < today ? starts[0] : today;
    anchorBal = state.startingBalance || 0;
  }

  const buckets = bucketByDate(state, anchorDate, monthEnd);
  let bal = anchorBal;
  let cur = anchorDate;
  let currentBalance = anchorBal;
  let endBalance = anchorBal;
  let low = { date: today, balance: Infinity };
  let negativeDaysAhead = 0;
  while (cur <= monthEnd) {
    if (resets[cur] !== undefined) bal = resets[cur];
    bal += buckets[cur] || 0;
    const rb = Math.round(bal * 100) / 100;
    if (cur === today) currentBalance = rb;
    if (cur >= today) {
      if (rb < low.balance) low = { date: cur, balance: rb };
      if (rb < 0) negativeDaysAhead++;
    }
    if (cur === monthEnd) endBalance = rb;
    cur = addDays(cur, 1);
  }
  if (low.balance === Infinity) low = { date: today, balance: currentBalance };

  // Every item from today through the end of the month, with a running balance
  // starting from the balance entering today (currentBalance already includes
  // today's items, so back those out first).
  const rest = expandOccurrences(state, addDays(today, -3), addDays(monthEnd, 3))
    .filter((o) => o.date >= today && o.date <= monthEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  const signed = (o: Occ) => (o.type === "income" ? o.amount : -o.amount);
  const todayNet = rest.filter((o) => o.date === today).reduce((s, o) => s + signed(o), 0);
  let run = Math.round((currentBalance - todayNet) * 100) / 100;
  const upcoming = rest.map((o) => {
    run = Math.round((run + signed(o)) * 100) / 100;
    return { name: o.name, date: o.date, amount: o.amount, type: o.type, running: run };
  });

  return {
    monthLabel: `${FULL_MONTHS[tm]} ${ty}`,
    today,
    currentBalance,
    totalIn: Math.round(totalIn),
    totalOut: Math.round(totalOut),
    low,
    end: { date: monthEnd, balance: endBalance },
    negativeDaysAhead,
    upcoming,
  };
}

export function renderDashboardEmail(d: MonthDashboard): RenderedEmail {
  const subject = `Flowy Cash: your week ahead — ${d.monthLabel}`;

  const text = [
    `Monday dashboard for ${d.monthLabel}:`,
    ``,
    `Current balance: ${fmt(d.currentBalance)}`,
    `This month — in ${fmt(d.totalIn)}, out ${fmt(d.totalOut)}`,
    `Projected low: ${fmt(d.low.balance)} on ${friendlyDate(d.low.date)}`,
    `End of month: ${fmt(d.end.balance)}`,
    d.negativeDaysAhead > 0 ? `Heads up: ${d.negativeDaysAhead} day(s) go negative this month.` : `No negative days ahead this month.`,
    ``,
    d.upcoming.length ? `Rest of ${d.monthLabel} (running balance):` : `Nothing else scheduled this month.`,
    ...d.upcoming.map((p) => `  ${friendlyDate(p.date)} — ${p.name} ${p.type === "income" ? "+" : "-"}${fmt(p.amount)}  →  ${fmt(p.running)}`),
  ].join("\n");

  const stat = (label: string, value: string, color: string) =>
    `<td style="padding:10px 12px;border:1px solid #eef2f7;border-radius:10px;">
       <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">${label}</div>
       <div style="font-size:18px;font-weight:800;color:${color};margin-top:2px;">${value}</div></td>`;

  const weekRows = d.upcoming.length
    ? d.upcoming.map((p) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:13px;border-bottom:1px solid #f1f5f9;">
        <span style="color:#334155;flex:1;overflow:hidden;"><span style="color:#94a3b8;font-size:11px;">${friendlyDate(p.date)}</span>&nbsp;&nbsp;${escapeHtml(p.name)}</span>
        <span style="font-weight:700;color:${p.type === "income" ? "#059669" : "#dc2626"};white-space:nowrap;">${p.type === "income" ? "+" : "-"}${fmt(p.amount)}</span>
        <span style="width:78px;text-align:right;font-weight:700;color:${p.running < 0 ? "#dc2626" : "#334155"};font-variant-numeric:tabular-nums;white-space:nowrap;">${fmt(p.running)}</span></div>`).join("") +
      `<div style="display:flex;justify-content:flex-end;font-size:10px;color:#94a3b8;padding-top:4px;">running balance →</div>`
    : `<div style="font-size:13px;color:#94a3b8;">Nothing else scheduled this month.</div>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);">
    <div style="background:#065f46;padding:20px 24px;">
      <div style="color:#d1fae5;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;">Flowy Cash · ${d.monthLabel}</div>
      <div style="color:#fff;font-size:20px;font-weight:800;margin-top:2px;">Your week ahead</div>
    </div>
    <div style="padding:20px 24px;">
      <div style="font-size:12px;color:#94a3b8;">Current balance</div>
      <div style="font-size:34px;font-weight:800;color:${d.currentBalance < 0 ? "#dc2626" : "#065f46"};">${fmt(d.currentBalance)}</div>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin:12px -6px;"><tr>
        ${stat("In (mo)", fmt(d.totalIn), "#059669")}${stat("Out (mo)", fmt(d.totalOut), "#dc2626")}
      </tr><tr>
        ${stat("Low", fmt(d.low.balance), d.low.balance < 0 ? "#dc2626" : "#334155")}${stat("End of mo", fmt(d.end.balance), d.end.balance < 0 ? "#dc2626" : "#334155")}
      </tr></table>
      ${d.negativeDaysAhead > 0 ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;font-size:12.5px;color:#991b1b;margin-bottom:12px;">${d.negativeDaysAhead} day${d.negativeDaysAhead === 1 ? "" : "s"} go negative this month — open Flowy Cash to smooth it out.</div>` : ""}
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin:6px 0 4px;">Rest of ${d.monthLabel}</div>
      ${weekRows}
    </div>
    <div style="padding:0 24px 22px;color:#94a3b8;font-size:12px;">A Monday snapshot from Flowy Cash.</div>
  </div></body></html>`;

  return { subject, html, text };
}

function row(color: string, title: string, body: string) {
  return `<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #f1f5f9;">
    <div style="width:10px;height:10px;border-radius:50%;background:${color};margin-top:5px;flex-shrink:0;"></div>
    <div><div style="font-size:14px;font-weight:700;color:#1e293b;">${escapeHtml(title)}</div>
    <div style="font-size:13px;color:#64748b;line-height:1.5;margin-top:2px;">${body}</div></div>
  </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
