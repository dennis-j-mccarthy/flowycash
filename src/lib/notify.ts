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
  overdue: { name: string; date: string; amount: number; type: string }[];
  negativeDays: { date: string; balance: number }[];
  resetDivergence: { from: string; to: string; predicted: number; actual: number; diff: number } | null;
  hasFindings: boolean;
}

interface ReportOpts {
  today?: string;
  horizonDays?: number;
}

// Compare the current forecast against the last balance reset and surface drift:
// overdue planned items, upcoming negative days, and a big reset-to-reset gap.
export function buildDriftReport(state: AppState, opts?: ReportOpts): DriftReport {
  const today = opts?.today || todayKey();
  const horizon = opts?.horizonDays ?? 60;
  const resets = state.balanceResets || {};
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

  const hasFindings = overdue.length > 0 || negativeDays.length > 0 || resetDivergence != null;
  return { today, overdue, negativeDays, resetDivergence, hasFindings };
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

  if (report.negativeDays.length) {
    const first = report.negativeDays[0];
    const worst = report.negativeDays.reduce((m, d) => (d.balance < m.balance ? d : m), report.negativeDays[0]);
    textLines.push(`• Your balance is forecast to go negative on ${friendlyDate(first.date)} (down to ${fmt(worst.balance)} at its lowest across ${report.negativeDays.length} day${report.negativeDays.length === 1 ? "" : "s"}).`);
    htmlSections.push(row("#ef4444", "Forecast goes negative",
      `Starting ${friendlyDate(first.date)}, your balance dips below zero — as low as <strong>${fmt(worst.balance)}</strong> across ${report.negativeDays.length} day${report.negativeDays.length === 1 ? "" : "s"}. Move an expense or add income before then.`));
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
