"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Transaction, OverrideData, AppState } from "@/lib/types";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const THEMES: Record<string, { name: string; headerBg: string; headerText: string; dayBarBg: string; dayBarText: string; dayBarBorder: string; accent: string; swatch: string; totalBg: string; totalBorder: string; totalText: string; itemText: string; gridBorder: string; calBg: string }> = {
  forest:  { name: "Forest",  headerBg: "#065f46", headerText: "#d1fae5", dayBarBg: "#047857", dayBarText: "#fff", dayBarBorder: "#065f46", accent: "#10b981", swatch: "#065f46", totalBg: "#ecfdf5", totalBorder: "#a7f3d0", totalText: "#065f46", itemText: "#1e293b", gridBorder: "#d1fae5", calBg: "#fff" },
  ocean:   { name: "Ocean",   headerBg: "#1e3a5f", headerText: "#bfdbfe", dayBarBg: "#2563eb", dayBarText: "#fff", dayBarBorder: "#1e40af", accent: "#3b82f6", swatch: "#1e3a5f", totalBg: "#eff6ff", totalBorder: "#93c5fd", totalText: "#1e3a5f", itemText: "#1e293b", gridBorder: "#bfdbfe", calBg: "#f8faff" },
  slate:   { name: "Slate",   headerBg: "#1e293b", headerText: "#cbd5e1", dayBarBg: "#334155", dayBarText: "#e2e8f0", dayBarBorder: "#1e293b", accent: "#64748b", swatch: "#1e293b", totalBg: "#f1f5f9", totalBorder: "#cbd5e1", totalText: "#334155", itemText: "#1e293b", gridBorder: "#e2e8f0", calBg: "#fff" },
  plum:    { name: "Plum",    headerBg: "#581c87", headerText: "#e9d5ff", dayBarBg: "#7c3aed", dayBarText: "#fff", dayBarBorder: "#6d28d9", accent: "#a855f7", swatch: "#581c87", totalBg: "#faf5ff", totalBorder: "#d8b4fe", totalText: "#581c87", itemText: "#1e293b", gridBorder: "#e9d5ff", calBg: "#fefcff" },
  ember:   { name: "Ember",   headerBg: "#7c2d12", headerText: "#fed7aa", dayBarBg: "#c2410c", dayBarText: "#fff", dayBarBorder: "#9a3412", accent: "#f97316", swatch: "#7c2d12", totalBg: "#fff7ed", totalBorder: "#fdba74", totalText: "#7c2d12", itemText: "#1e293b", gridBorder: "#fed7aa", calBg: "#fffbf5" },
};

const TAG_COLORS: { bg: string; text: string }[] = [
  { bg: "#dbeafe", text: "#1e40af" }, // blue
  { bg: "#dcfce7", text: "#166534" }, // green
  { bg: "#fef3c7", text: "#92400e" }, // amber
  { bg: "#fce7f3", text: "#9d174d" }, // pink
  { bg: "#e0e7ff", text: "#3730a3" }, // indigo
  { bg: "#fed7d7", text: "#9b2c2c" }, // red
  { bg: "#d5f5f6", text: "#0f766e" }, // teal
  { bg: "#f3e8ff", text: "#6b21a8" }, // purple
  { bg: "#ffedd5", text: "#9a3412" }, // orange
  { bg: "#ecfdf5", text: "#065f46" }, // emerald
];
const HIGHLIGHTS: { key: string; bg: string; border: string; label: string }[] = [
  { key: "", bg: "transparent", border: "#d1d5db", label: "None" },
  { key: "red", bg: "#fee2e2", border: "#ef4444", label: "Red" },
  { key: "orange", bg: "#ffedd5", border: "#f97316", label: "Orange" },
  { key: "yellow", bg: "#fef9c3", border: "#eab308", label: "Yellow" },
  { key: "green", bg: "#dcfce7", border: "#22c55e", label: "Green" },
  { key: "blue", bg: "#dbeafe", border: "#3b82f6", label: "Blue" },
  { key: "purple", bg: "#f3e8ff", border: "#a855f7", label: "Purple" },
];
function hlColor(key: string) {
  return HIGHLIGHTS.find((h) => h.key === key) || HIGHLIGHTS[0];
}

function tagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = ((h << 5) - h + tag.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}

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
  const s = a.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
  formData?: { name: string; amount: number; type: string; autopay?: boolean; tags?: string; highlight?: string };
  newDate?: string;
}

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  const text = await res.text();
  if (!text) return {};
  return JSON.parse(text);
}

function buildDemoData(): AppState {
  let id = 0;
  const tx = (name: string, amount: number, type: string, recurrence: string, startDate: string, autopay = false, tags = "") =>
    ({ id: `demo-${++id}`, name, amount, type, recurrence, startDate, autopay, tags });
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = (day: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    startingBalance: 3200,
    balanceResets: {},
    overrides: {},
    transactions: [
      tx("Salary", 5200, "income", "monthly", d(1), false, "income"),
      tx("Side Gig", 800, "income", "monthly", d(15), false, "income"),
      tx("Rent", 1850, "expense", "monthly", d(1), true, "housing"),
      tx("Utilities", 145, "expense", "monthly", d(3), true, "utilities"),
      tx("Internet", 65, "expense", "monthly", d(3), true, "utilities"),
      tx("Car Payment", 420, "expense", "monthly", d(5), true, "auto,debt"),
      tx("Car Insurance", 135, "expense", "monthly", d(5), true, "auto,insurance"),
      tx("Groceries", 180, "expense", "weekly", d(1), false, "groceries"),
      tx("Gas", 55, "expense", "weekly", d(2), false, "auto,gas"),
      tx("Netflix", 16, "expense", "monthly", d(8), true, "subscriptions"),
      tx("Spotify", 11, "expense", "monthly", d(8), true, "subscriptions"),
      tx("Gym", 45, "expense", "monthly", d(10), true, "health"),
      tx("Phone", 85, "expense", "monthly", d(12), true, "utilities"),
      tx("Student Loan", 350, "expense", "monthly", d(15), true, "debt"),
      tx("Credit Card", 475, "expense", "monthly", d(20), false, "debt"),
      tx("Dining Out", 60, "expense", "weekly", d(5), false, "food"),
      tx("Dog Walker", 100, "expense", "weekly", d(3), false, "pets"),
      tx("Savings", 400, "expense", "monthly", d(1), false, "savings"),
      tx("Haircut", 45, "expense", "none", d(14), false, "personal"),
      tx("Doctor Copay", 30, "expense", "none", d(18), false, "health"),
      tx("Amazon", 67, "expense", "none", d(9), false, "shopping"),
      tx("Birthday Gift", 50, "expense", "none", d(22), false, "personal"),
      tx("Freelance Payment", 600, "income", "none", d(20), false, "income"),
      tx("Parking Ticket", 75, "expense", "none", d(25), false, "auto"),
    ],
  };
}

export default function BudgetForecast() {
  const [demo, setDemo] = useState(() => typeof window !== "undefined" && localStorage.getItem("flowycash-demo") === "true");
  const [demoState, setDemoState] = useState<AppState | null>(null);
  const [state, setState] = useState<AppState>(DEF);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"calendar" | "list">(() => typeof window !== "undefined" && window.innerWidth >= 1000 ? "calendar" : "list");
  useEffect(() => {
    const onResize = () => setView(window.innerWidth >= 1000 ? "calendar" : "list");
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [cY, setCY] = useState(new Date().getFullYear());
  const [fontSize, setFontSize] = useState(14);
  const [showTags, setShowTags] = useState(false);
  const [showTagPills, setShowTagPills] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [theme, setTheme] = useState(() => typeof window !== "undefined" ? localStorage.getItem("flowycash-theme") || "forest" : "forest");
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState(false);
  const [touchDrag, setTouchDrag] = useState<{ tx: Transaction; od: string } | null>(null);
  const [touchGhost, setTouchGhost] = useState<{ x: number; y: number; name: string } | null>(null);
  const [touchOverDate, setTouchOverDate] = useState<string | null>(null);
  const touchRef = useRef<{ tx: Transaction; od: string; overDate: string | null }>({ tx: null as any, od: "", overDate: null });
  const ghostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMove(e: TouchEvent) {
      if (!touchRef.current.tx) return;
      e.preventDefault();
      const t = e.touches[0];
      if (ghostRef.current) {
        ghostRef.current.style.left = `${t.clientX + 12}px`;
        ghostRef.current.style.top = `${t.clientY - 16}px`;
        ghostRef.current.style.display = "block";
      }
      // Temporarily hide ghost to find element underneath
      if (ghostRef.current) ghostRef.current.style.pointerEvents = "none";
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const dayRow = el?.closest("[data-daydate]") as HTMLElement | null;
      const d = dayRow?.dataset.daydate || null;
      touchRef.current.overDate = d;
      // Highlight: remove old, add new
      document.querySelectorAll("[data-daydate]").forEach((row) => {
        (row as HTMLElement).style.outline = row.getAttribute("data-daydate") === d ? "2px solid #3b82f6" : "";
        (row as HTMLElement).style.background = row.getAttribute("data-daydate") === d ? "#bfdbfe" : "";
      });
    }
    function onEnd() {
      if (!touchRef.current.tx) return;
      const target = touchRef.current.overDate;
      const drag = touchRef.current;
      if (ghostRef.current) ghostRef.current.style.display = "none";
      // Clear highlights
      document.querySelectorAll("[data-daydate]").forEach((row) => {
        (row as HTMLElement).style.outline = "";
        (row as HTMLElement).style.background = "";
      });
      if (target && target !== drag.od) {
        if (drag.tx.recurrence !== "none") {
          setPending({ type: "move", tx: drag.tx, occDate: drag.od, newDate: target });
          setRecurPrompt(true);
        } else {
          callApi(`/api/transactions/${drag.tx.id}`, { method: "PUT", body: JSON.stringify({ startDate: target }) }).then(() => reload());
        }
        setExpandedDays((prev) => { const next = new Set(prev); next.add(drag.od); next.add(target); return next; });
      }
      touchRef.current = { tx: null as any, od: "", overDate: null };
      setTouchDrag(null);
    }
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    return () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, []);
  const [cM, setCM] = useState(new Date().getMonth());
  const [panel, setPanel] = useState<string | null>(null);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editDate, setEditDate] = useState<string | null>(null);
  const [recurPrompt, setRecurPrompt] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [dragItem, setDragItem] = useState<{ tx: Transaction; od: string } | null>(null);
  const [recurPopupPos, setRecurPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [adviceDay, setAdviceDay] = useState<string | null>(null);
  const [zoomWeek, setZoomWeek] = useState<number | null>(null);
  const [zoomDay, setZoomDay] = useState<string | null>(null);
  const [dropTgt, setDropTgt] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", amount: "", type: "expense", recurrence: "none", date: "", autopay: false, tags: "", highlight: "" });
  const [resetAmt, setResetAmt] = useState("");
  const [resetDt, setResetDt] = useState("");
  const [balInput, setBalInput] = useState("");

  const demoApi = useCallback(async (url: string, opts?: RequestInit) => {
    if (!demoState) return {};
    const body = opts?.body ? JSON.parse(opts.body as string) : {};
    const method = opts?.method || "GET";
    let ds = { ...demoState, transactions: [...demoState.transactions], overrides: { ...demoState.overrides }, balanceResets: { ...demoState.balanceResets } };

    if (url === "/api/transactions" && method === "POST") {
      ds.transactions.push({ id: `demo-${Date.now()}`, name: body.name, amount: body.amount, type: body.type, recurrence: body.recurrence || "none", startDate: body.startDate, autopay: body.autopay || false, tags: body.tags || "" });
    } else if (url.startsWith("/api/transactions/") && method === "PUT") {
      const id = url.split("/").pop()!;
      ds.transactions = ds.transactions.map((t) => t.id === id ? { ...t, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) } : t);
    } else if (url.startsWith("/api/transactions/") && method === "DELETE") {
      const id = url.split("/").pop()!;
      ds.transactions = ds.transactions.filter((t) => t.id !== id);
    } else if (url === "/api/overrides" && method === "POST") {
      const key = `${body.transactionId}::${body.occurrenceDate}`;
      ds.overrides[key] = { ...ds.overrides[key], ...body };
    } else if (url === "/api/balance-resets" && method === "POST") {
      ds.balanceResets[body.date] = body.amount;
    } else if (url.startsWith("/api/balance-resets/") && method === "DELETE") {
      const date = url.split("/").pop()!;
      delete ds.balanceResets[date];
    } else if (url === "/api/settings" && method === "PUT") {
      ds.startingBalance = body.startingBalance;
    }

    setDemoState(ds);
    setState(ds);
    return {};
  }, [demoState]);

  const callApi = useCallback(async (url: string, opts?: RequestInit) => {
    return demo ? demoApi(url, opts) : api(url, opts);
  }, [demo, demoApi]);

  const reload = useCallback(async () => {
    if (demo) {
      // In demo mode, demoApi already sets state — reload is a no-op
      return state;
    }
    const data = await api("/api/state");
    if (data && data.transactions) {
      setState(data);
      return data;
    }
    return state;
  }, [demo, state]);

  useEffect(() => {
    if (demo) {
      const ds = demoState || buildDemoData();
      if (!demoState) setDemoState(ds);
      setState(ds);
      setBalInput(String(ds.startingBalance || 0));
      setLoaded(true);
      return;
    }
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
    (state.transactions || []).forEach((tx) => {
      const occs = getOccurrences(tx.startDate, tx.recurrence, rStart, rEnd);
      occs.forEach((odk) => {
        const ok = `${tx.id}::${odk}`;
        const ov = state.overrides[ok] as OverrideData | undefined;
        if (ov?.deleted) return;
        const ovClean = ov ? Object.fromEntries(Object.entries(ov).filter(([, v]) => v != null)) : {};
        const eff = ov ? { ...tx, ...ovClean, id: tx.id, recurrence: tx.recurrence, startDate: tx.startDate } : tx;
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

  function getAdvice(dateKey: string) {
    const dd = dayMap[dateKey];
    if (!dd || dd.balance >= 0) return [];
    const deficit = Math.abs(dd.balance);
    const tips: { type: string; icon: string; text: string }[] = [];

    // Strategy 1: Find large expenses on this day that could be moved closer to a payday
    // Find nearest payday before this date
    const paydays = data.filter((d) => d.transactions.some((t) => t.type === "income" && t.amount >= 1000));
    const prevPayday = paydays.filter((p) => p.date <= dateKey).pop();
    const nextPayday = paydays.find((p) => p.date > dateKey);

    // Only suggest moving non-autopay expenses (autopay can't be rescheduled)
    const bigExpenses = dd.transactions
      .filter((t) => t.type === "expense" && t.amount >= 50 && !(t as any).autopay)
      .sort((a, b) => b.amount - a.amount);

    for (const exp of bigExpenses.slice(0, 2)) {
      if (nextPayday) {
        tips.push({
          type: "move",
          icon: "📅",
          text: `Move ${exp.name} ($${exp.amount.toFixed(0)}) to ${friendlyDate(nextPayday.date)} (next payday) to avoid going negative`,
        });
      } else if (prevPayday) {
        tips.push({
          type: "move",
          icon: "📅",
          text: `Move ${exp.name} ($${exp.amount.toFixed(0)}) closer to ${friendlyDate(prevPayday.date)} (last payday)`,
        });
      }
    }

    // Strategy 2: Calculate weekly spending reduction needed
    // Count weeks from today (or start of month) to the negative day
    const negDayIdx = data.findIndex((d) => d.date === dateKey);
    const todayIdx = data.findIndex((d) => d.date === todayKey);
    const startIdx = Math.max(0, todayIdx);
    const weeksUntil = Math.max(1, Math.ceil((negDayIdx - startIdx) / 7));
    // Sum weekly discretionary spending (weekly recurring expenses)
    const weeklyExpenses = data.slice(startIdx, negDayIdx)
      .flatMap((d) => d.transactions)
      .filter((t) => t.type === "expense" && t.recurrence === "weekly");
    const totalWeekly = weeklyExpenses.reduce((s, t) => s + Math.abs(t.amount), 0);
    if (totalWeekly > 0 && weeksUntil > 0) {
      const reductionPerWeek = Math.ceil(deficit / weeksUntil);
      const pct = Math.min(99, Math.round((deficit / totalWeekly) * 100));
      tips.push({
        type: "reduce",
        icon: "✂️",
        text: `Cut ~$${reductionPerWeek}/week from discretionary spending over the next ${weeksUntil} week${weeksUntil > 1 ? "s" : ""} (${pct}% reduction) to cover the $${deficit.toFixed(0)} shortfall`,
      });
    }

    // Strategy 3: If a single large expense on this day could be deferred past it
    const singleFix = bigExpenses.find((e) => e.amount >= deficit);
    if (singleFix && nextPayday) {
      tips.push({
        type: "defer",
        icon: "⏳",
        text: `Defer ${singleFix.name} ($${singleFix.amount.toFixed(0)}) by a few days past this date — fully covers the -$${deficit.toFixed(0)} shortfall`,
      });
    }

    // Strategy 4: Find big movable expenses on days BEFORE the negative day
    // Moving them to after the negative day would raise the balance on the negative day
    const negDayI = data.findIndex((d) => d.date === dateKey);
    const lookbackStart = Math.max(0, negDayI - 28); // look back up to 4 weeks
    const priorMovable: { name: string; amount: number; date: string }[] = [];
    for (let i = lookbackStart; i < negDayI; i++) {
      const d = data[i];
      for (const t of d.transactions) {
        if (t.type === "expense" && t.amount >= 100 && !(t as any).autopay) {
          priorMovable.push({ name: t.name, amount: t.amount, date: d.date });
        }
      }
    }
    priorMovable.sort((a, b) => b.amount - a.amount);
    // Suggest moving the biggest ones to after the negative day (near next payday)
    for (const exp of priorMovable.slice(0, 2)) {
      if (exp.amount >= deficit * 0.5) {
        const targetDay = nextPayday ? friendlyDate(nextPayday.date) : `after ${friendlyDate(dateKey)}`;
        tips.push({
          type: "delay",
          icon: "➡️",
          text: `Delay ${exp.name} ($${exp.amount.toFixed(0)}) from ${friendlyDate(exp.date)} to ${targetDay} — frees up cash before this date`,
        });
      }
    }

    return tips;
  }

  const allTags = Array.from(new Set(
    state.transactions.flatMap((t) => ((t as any).tags || "").split(",").map((s: string) => s.trim()).filter(Boolean))
  )).sort();

  const openPanel = (p: string) => {
    setPanel(p);
    setRecurPrompt(false);
  };
  function openAdd(date: string | null) {
    setEditTx(null);
    setEditDate(null);
    setForm({ name: "", amount: "", type: "expense", recurrence: "none", date: date || dkey(cY, cM, Math.min(new Date().getDate(), dim(cY, cM))), autopay: false, tags: "", highlight: "" });
    setTagInput("");
    openPanel("tx");
  }
  function openEdit(tx: Transaction, od: string) {
    setEditTx(tx);
    setEditDate(od);
    const ok = `${tx.id}::${od}`;
    const ov = state.overrides[ok] as OverrideData | undefined;
    const e = ov ? { ...tx, ...ov } : tx;
    setForm({ name: e.name || tx.name, amount: String(Math.abs(e.amount ?? tx.amount)), type: e.type || tx.type, recurrence: tx.recurrence, date: od, autopay: !!(tx as any).autopay, tags: (tx as any).tags || "", highlight: (tx as any).highlight || "" });
    setTagInput("");
    openPanel("tx");
  }

  async function handleSave() {
    const amt = parseFloat(form.amount);
    if (!form.name || isNaN(amt)) return;
    if (editTx) {
      const dateChanged = form.date !== editDate;
      if (editTx.recurrence !== "none") {
        if (dateChanged) {
          // For recurring: move + edit in one action
          setPending({ type: "move", tx: editTx, occDate: editDate!, newDate: form.date });
        } else {
          setPending({ type: "edit", formData: { name: form.name, amount: amt, type: form.type, autopay: form.autopay, tags: form.tags, highlight: form.highlight }, tx: editTx, occDate: editDate! });
        }
        setRecurPrompt(true);
        setPanel(null);
        // Expand both days in list view
        setExpandedDays((prev) => {
          const next = new Set(prev);
          next.add(editDate!);
          next.add(form.date);
          return next;
        });
        return;
      }
      // Non-recurring: update fields + move if date changed
      const body: Record<string, unknown> = { name: form.name, amount: amt, type: form.type, autopay: form.autopay, tags: form.tags, highlight: form.highlight };
      if (dateChanged) body.startDate = form.date;
      await callApi(`/api/transactions/${editTx.id}`, { method: "PUT", body: JSON.stringify(body) });
      // Expand both days in list view
      if (dateChanged) {
        setExpandedDays((prev) => {
          const next = new Set(prev);
          next.add(editDate!);
          next.add(form.date);
          return next;
        });
      }
    } else {
      await callApi("/api/transactions", { method: "POST", body: JSON.stringify({ name: form.name, amount: amt, type: form.type, recurrence: form.recurrence, startDate: form.date, autopay: form.autopay, tags: form.tags, highlight: form.highlight }) });
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
    await callApi(`/api/transactions/${editTx.id}`, { method: "DELETE" });
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
        await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occDate, deleted: true }) });
      } else {
        await callApi(`/api/transactions/${tx.id}`, { method: "DELETE" });
      }
    } else if (type === "edit") {
      const fd = pending.formData!;
      if (choice === "one") {
        await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occDate, name: fd.name, amount: fd.amount, type: fd.type }) });
      } else {
        await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ name: fd.name, amount: fd.amount, type: fd.type, autopay: fd.autopay, tags: fd.tags, highlight: fd.highlight }) });
      }
    } else if (type === "move") {
      const newDate = pending.newDate!;
      if (choice === "one") {
        await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occDate, movedTo: newDate }) });
      } else {
        await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ startDate: newDate }) });
      }
    }
    await reload();
    setPending(null);
  }

  async function handleResetSave() {
    const a = parseFloat(resetAmt);
    if (isNaN(a) || !resetDt) return;
    await callApi("/api/balance-resets", { method: "POST", body: JSON.stringify({ date: resetDt, amount: a }) });
    await reload();
    setPanel(null);
    setResetAmt("");
  }

  async function handleBalSave() {
    const v = parseFloat(balInput);
    if (isNaN(v)) return;
    await callApi("/api/settings", { method: "PUT", body: JSON.stringify({ startingBalance: v }) });
    await reload();
    setPanel(null);
  }

  async function deleteReset(date: string) {
    await callApi(`/api/balance-resets/${date}`, { method: "DELETE" });
    await reload();
  }

  async function handleTouchDrop(targetDate: string) {
    if (!touchDrag) return;
    const { tx, od } = touchDrag;
    if (targetDate === od) { setTouchDrag(null); return; }
    if (tx.recurrence !== "none") {
      setPending({ type: "move", tx, occDate: od, newDate: targetDate });
      setRecurPrompt(true);
    } else {
      await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ startDate: targetDate }) });
      await reload();
    }
    setExpandedDays((prev) => { const next = new Set(prev); next.add(od); next.add(targetDate); return next; });
    setTouchDrag(null);
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
      setRecurPopupPos({ x: e.clientX, y: e.clientY });
      setRecurPrompt(true);
    } else {
      await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ startDate: targetDate }) });
      await reload();
    }
    setDragItem(null);
  }

  const prevM = () => {
    if (cM === 0) { setCM(11); setCY(cY - 1); } else setCM(cM - 1);
    setZoomWeek(null);
  };
  const nextM = () => {
    if (cM === 11) { setCM(0); setCY(cY + 1); } else setCM(cM + 1);
    setZoomWeek(null);
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
    .tx-chip:hover { background: #eef2ff !important; outline: 1.5px solid #818cf8; outline-offset: -1px; border-radius: 5px; }
    .list-row { transition: all 0.1s; }
    .list-row:hover { background: #eef2ff !important; outline: 1.5px solid #818cf8; outline-offset: -1px; }
    .tag-pill:hover .tag-popup { display: block !important; }
    .tag-pill:hover { background: #f1f5f9 !important; border-color: #cbd5e1 !important; }
    .stat-pill:hover .stat-popup { display: block !important; }
    .stat-pill:hover { background: #f8fafc !important; }
    .day-num:hover .day-mag { display: inline !important; }
  `;

  const th = THEMES[theme] || THEMES.forest;

  const C = {
    green: "#10b981", greenDark: "#059669", greenBg: "rgba(16,185,129,0.08)", greenBorder: "rgba(16,185,129,0.2)",
    red: "#ef4444", redDark: "#dc2626", redBg: "rgba(239,68,68,0.06)", redBorder: "rgba(239,68,68,0.2)",
    blue: "#3b82f6", blueDark: "#2563eb", blueBg: "rgba(59,130,246,0.06)", blueBorder: "rgba(59,130,246,0.2)",
  };

  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, sans-serif', width: "100%", margin: 0, padding: "24px 32px", color: "#1e293b", height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{css}</style>

      {/* Header */}
      <div style={{ flexShrink: 0, background: th.headerBg, borderRadius: 14, padding: "12px 20px", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo-white.png" alt="flowycash.com" style={{ height: 44 }} />
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setShowTagPills((v) => !v)} className="bf-btn" title="Tags"
              style={{ width: 32, height: 32, borderRadius: "50%", border: showTagPills ? `1.5px solid ${th.accent}` : "1.5px solid rgba(255,255,255,0.3)", background: showTagPills ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showTagPills ? th.headerBg : th.headerText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            </button>
            <button onClick={() => setShowChart((v) => !v)} className="bf-btn" title="Chart"
              style={{ width: 32, height: 32, borderRadius: "50%", border: showChart ? `1.5px solid ${th.accent}` : "1.5px solid rgba(255,255,255,0.3)", background: showChart ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showChart ? th.headerBg : th.headerText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </button>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.2)", margin: "0 8px" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(() => {
            // Build detail items for each stat pill
            const incomeItems: { name: string; total: number; count: number }[] = [];
            const expenseItems: { name: string; total: number; count: number }[] = [];
            data.forEach((d) => d.transactions.forEach((t) => {
              const list = t.type === "income" ? incomeItems : expenseItems;
              const existing = list.find((i) => i.name === t.name);
              if (existing) { existing.total += Math.abs(t.amount); existing.count++; }
              else list.push({ name: t.name, total: Math.abs(t.amount), count: 1 });
            }));
            incomeItems.sort((a, b) => b.total - a.total);
            expenseItems.sort((a, b) => b.total - a.total);
            const lowDay = data.reduce((min, d) => d.balance < min.balance ? d : min, data[0]);
            const endDay = data[data.length - 1];

            const pills: { label: string; val: string; color: string; border: string; items: { name: string; val: string; color: string }[] }[] = [
              { label: "In", val: `+${fmtShort(totalIn)}`, color: C.greenDark, border: C.green,
                items: incomeItems.map((i) => ({ name: `${i.name}${i.count > 1 ? ` ×${i.count}` : ""}`, val: `+${fmt(i.total)}`, color: C.greenDark })) },
              { label: "Out", val: `-${fmtShort(totalOut)}`, color: C.redDark, border: C.red,
                items: expenseItems.map((i) => ({ name: `${i.name}${i.count > 1 ? ` ×${i.count}` : ""}`, val: `-${fmt(i.total)}`, color: C.redDark })) },
            ];
            const pills2: typeof pills = [
              { label: "Low", val: fmtShort(minBal), color: minBal < 0 ? C.redDark : "#64748b", border: minBal < 0 ? C.red : "#d1d5db", items: [] },
              { label: "End", val: fmtShort(endBal), color: endBal < 0 ? C.redDark : C.greenDark, border: endBal < 0 ? C.red : C.green, items: [] },
            ];

            return (<>
              {pills.map(({ label, val, color, border, items }) => (
                <div key={label} className="stat-pill" style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "#fff", border: `1.5px solid ${border}`, position: "relative", cursor: "default" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{val}</span>
                  <span style={{ fontSize: 8, color: "#94a3b8", lineHeight: 1 }}>▼</span>
                  <div className="stat-popup" style={{ display: "none", position: "absolute", top: "100%", right: 0, marginTop: 4, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "10px 14px", zIndex: 40, minWidth: 240, maxHeight: 350, overflowY: "auto" }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0", fontSize: 12 }}>
                        <span style={{ color: "#666677" }}>{item.name}</span>
                        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: item.color, whiteSpace: "nowrap" }}>{item.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ width: 1, height: 20, background: "#e2e8f0", margin: "0 8px" }} />
              {pills2.map(({ label, val, color, border, items }) => (
                <div key={label} className={items.length ? "stat-pill" : ""} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "#fff", border: `1.5px solid ${border}`, position: "relative", cursor: "default" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{val}</span>
                  {items.length > 0 && (
                    <div className="stat-popup" style={{ display: "none", position: "absolute", top: "100%", right: 0, marginTop: 4, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "10px 14px", zIndex: 40, minWidth: 240, maxHeight: 350, overflowY: "auto" }}>
                      {items.map((item, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0", fontSize: 12, ...(i === 0 ? { fontWeight: 700, borderBottom: "1px solid #f1f5f9", paddingBottom: 6, marginBottom: 4 } : {}) }}>
                          <span style={{ color: i === 0 ? "#1e293b" : "#666677" }}>{item.name}</span>
                          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: item.color, whiteSpace: "nowrap" }}>{item.val}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>);
          })()}
          </div>
          <div style={{ width: 1, height: 20, background: "#e2e8f0" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={prevM} className="bf-btn" style={{ width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", fontSize: 13, color: th.headerText, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", minWidth: 140, textAlign: "center", color: th.headerText }}>{MONTHS[cM]} {cY}</span>
            <button onClick={nextM} className="bf-btn" style={{ width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", fontSize: 13, color: th.headerText, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          </div>
        </div>
      </div>

      {showTagPills && (() => {
        const tagTotals: Record<string, { income: number; expense: number; items: { name: string; amount: number; type: string; date: string }[] }> = {};
        data.forEach((d) => d.transactions.forEach((t) => {
          const tags = ((t as any).tags || "").split(",").map((s: string) => s.trim()).filter(Boolean);
          if (tags.length === 0) tags.push("untagged");
          tags.forEach((tag: string) => {
            if (!tagTotals[tag]) tagTotals[tag] = { income: 0, expense: 0, items: [] };
            if (t.type === "income") tagTotals[tag].income += Math.abs(t.amount);
            else tagTotals[tag].expense += Math.abs(t.amount);
            tagTotals[tag].items.push({ name: t.name, amount: Math.abs(t.amount), type: t.type, date: d.date });
          });
        }));
        const sorted = Object.entries(tagTotals).sort((a, b) => (b[1].expense + b[1].income) - (a[1].expense + a[1].income));
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6, flexShrink: 0 }}>
            {sorted.map(([tag, { income, expense, items }]) => (
              <div key={tag} className="tag-pill" style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 14, background: tagColor(tag).bg, border: `1px solid ${tagColor(tag).text}22`, fontSize: 13, position: "relative", cursor: "default" }}>
                <span style={{ fontWeight: 700, color: tagColor(tag).text }}>{tag}</span>
                {income > 0 && <span style={{ fontWeight: 700, color: C.greenDark, fontVariantNumeric: "tabular-nums" }}>+{fmtShort(income)}</span>}
                {expense > 0 && <span style={{ fontWeight: 700, color: C.redDark, fontVariantNumeric: "tabular-nums" }}>-{fmtShort(expense)}</span>}
                <div className="tag-popup" style={{ display: "none", position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "10px 14px", zIndex: 40, minWidth: 220, maxHeight: 300, overflowY: "auto" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 6, borderBottom: "1px solid #f1f5f9", paddingBottom: 6 }}>{tag}</div>
                  {items.sort((a, b) => a.date.localeCompare(b.date)).map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 12, gap: 8 }}>
                      <span style={{ color: "#94a3b8", fontSize: 10, flexShrink: 0 }}>{item.date.slice(5)}</span>
                      <span style={{ color: th.itemText, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: item.type === "income" ? C.greenDark : C.redDark, flexShrink: 0 }}>{fmt(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Cashflow Chart */}
      {showChart && data.length > 0 && (() => {
        const balances = data.map((d) => d.balance);
        const maxB = Math.max(...balances, 0);
        const minB = Math.min(...balances, 0);
        const range = maxB - minB || 1;
        const yAxisW = 55;
        const w = 800;
        const h = 150;
        const padT = 6;
        const padB = 20;
        const chartL = yAxisW;
        const chartR = w - 4;
        const chartW = chartR - chartL;
        const chartH = h - padT - padB;
        const zeroY = padT + ((maxB - 0) / range) * chartH;
        const points = balances.map((b, i) => {
          const x = chartL + (i / (balances.length - 1)) * chartW;
          const y = padT + ((maxB - b) / range) * chartH;
          return `${x},${y}`;
        });
        const areaPoints = [...points, `${chartR},${zeroY}`, `${chartL},${zeroY}`];
        // Y-axis ticks
        const ticks: number[] = [];
        const step = Math.pow(10, Math.floor(Math.log10(range))) || 1000;
        const niceStep = range / step > 5 ? step * 2 : step;
        for (let v = Math.floor(minB / niceStep) * niceStep; v <= maxB; v += niceStep) {
          ticks.push(v);
        }
        return (
          <div style={{ flexShrink: 0, marginBottom: 8, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", padding: "8px 12px" }}>
            <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
              {/* Y axis ticks and labels */}
              {ticks.map((v) => {
                const y = padT + ((maxB - v) / range) * chartH;
                return (
                  <g key={v}>
                    <line x1={chartL} y1={y} x2={chartR} y2={y} stroke={v === 0 ? "#94a3b8" : "#e2e8f0"} strokeWidth={v === 0 ? 1 : 0.5} />
                    <text x={yAxisW - 6} y={y + 3} textAnchor="end" fill={v < 0 ? "#ef4444" : "#94a3b8"} fontSize="9" fontFamily="Inter, sans-serif">{fmtShort(v)}</text>
                  </g>
                );
              })}
              {/* Area fill - green above zero, red below */}
              <defs>
                <clipPath id="aboveZero"><rect x={chartL} y={padT} width={chartW} height={zeroY - padT} /></clipPath>
                <clipPath id="belowZero"><rect x={chartL} y={zeroY} width={chartW} height={h - padB - zeroY} /></clipPath>
              </defs>
              <polygon points={areaPoints.join(" ")} fill="rgba(16,185,129,0.12)" clipPath="url(#aboveZero)" />
              <polygon points={areaPoints.join(" ")} fill="rgba(239,68,68,0.15)" clipPath="url(#belowZero)" />
              {/* Line - green above zero, red below */}
              <polyline points={points.join(" ")} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" clipPath="url(#aboveZero)" />
              <polyline points={points.join(" ")} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" clipPath="url(#belowZero)" />
              {/* Negative day dots */}
              {balances.map((b, i) => {
                if (b >= 0) return null;
                const x = chartL + (i / (balances.length - 1)) * chartW;
                const y = padT + ((maxB - b) / range) * chartH;
                return <circle key={i} cx={x} cy={y} r="3" fill="#ef4444" />;
              })}
              {/* Y axis line */}
              <line x1={chartL} y1={padT} x2={chartL} y2={h - padB} stroke="#cbd5e1" strokeWidth="1" />
              {/* X axis line */}
              <line x1={chartL} y1={h - padB} x2={chartR} y2={h - padB} stroke="#cbd5e1" strokeWidth="1" />
              {/* X axis day labels */}
              {data.map((d, i) => {
                if (data.length > 15 && d.day % 5 !== 1 && d.day !== data.length) return null;
                if (data.length <= 15 || d.day % 5 === 1 || d.day === data.length) {
                  const x = chartL + (i / (balances.length - 1)) * chartW;
                  return (
                    <g key={d.date}>
                      <line x1={x} y1={h - padB} x2={x} y2={h - padB + 4} stroke="#cbd5e1" strokeWidth="1" />
                      <text x={x} y={h - 4} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="Inter, sans-serif">{d.day}</text>
                    </g>
                  );
                }
                return null;
              })}
            </svg>
          </div>
        );
      })()}

      {/* Day Zoom Modal */}
      {zoomDay && (() => {
        const dd = dayMap[zoomDay];
        const { year, month, day: dayNum } = pdk(zoomDay);
        const dayName = DAY_NAMES[new Date(year, month, dayNum).getDay()];
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, animation: "panelIn 0.18s ease" }}
            onClick={() => setZoomDay(null)}>
            <div style={{ background: "#fff", borderRadius: 20, width: 420, maxWidth: "92vw", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden" }}
              onClick={(e) => e.stopPropagation()}>
              {/* Day header */}
              <div style={{ background: th.headerBg, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 13, color: th.headerText, opacity: 0.7, fontWeight: 500 }}>{dayName}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em" }}>{MONTHS[month]} {dayNum}</div>
                </div>
                <button onClick={() => setZoomDay(null)} className="bf-btn" style={{ border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 18, width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>×</button>
                <div style={{ textAlign: "right" }}>
                  {dd?.hasReset && <div style={{ fontSize: 9, fontWeight: 700, background: "rgba(255,255,255,0.2)", color: "#fff", padding: "2px 8px", borderRadius: 4, marginBottom: 4 }}>RESET</div>}
                  <div style={{ fontSize: 24, fontWeight: 800, color: dd && dd.balance < 0 ? "#fca5a5" : "#a7f3d0", fontVariantNumeric: "tabular-nums" }}>{dd ? fmt(dd.balance) : "$0"}</div>
                </div>
              </div>
              {/* Transactions */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
                {dd && dd.transactions.length > 0 ? dd.transactions.map((tx, i) => (
                  <div key={i} className="tx-chip"
                    onClick={() => { setZoomDay(null); openEdit(tx, tx.occurrenceDate); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 24px", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ width: 14, flexShrink: 0, fontSize: 14, color: tx.recurrence !== "none" ? "#64748b" : "transparent" }}>{tx.recurrence !== "none" ? "↻" : ""}</span>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: th.itemText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.name}</div>
                      {(tx as any).tags && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{(tx as any).tags}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      {(tx as any).autopay && <svg width="10" height="12" viewBox="0 0 8 10" style={{ opacity: 0.6 }}><path d="M4.5 0L0 6h3.5L3 10l5-6H4.5z" fill="#f59e0b"/></svg>}
                      <span style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: tx.type === "income" ? C.greenDark : C.redDark }}>
                        {tx.type === "income" ? "+" : "-"}{fmt(Math.abs(tx.amount))}
                      </span>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>No transactions</div>
                )}
              </div>
              {/* Footer */}
              <div style={{ padding: "12px 24px", borderTop: `1px solid ${th.totalBorder}`, background: th.totalBg, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => { setZoomDay(null); openAdd(zoomDay); }} className="bf-btn"
                  style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: th.headerBg, color: "#fff", fontSize: 13, fontWeight: 600 }}>
                  + Add Transaction
                </button>
                {dd && dd.balance < 0 && (
                  <button onClick={() => { setZoomDay(null); setAdviceDay(zoomDay); }} className="bf-btn"
                    style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #f59e0b", background: "#fef3c7", color: "#92400e", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>
                    Get Advice
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
              {form.recurrence !== "none" && (
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}>
                  <div onClick={() => setForm({ ...form, autopay: !form.autopay })}
                    style={{ width: 36, height: 20, borderRadius: 10, background: form.autopay ? C.blueDark : "#d1d5db", position: "relative", transition: "background 0.15s", cursor: "pointer" }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: form.autopay ? 18 : 2, transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                  </div>
                  <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                    Autopay
                    <svg width="10" height="12" viewBox="0 0 8 10" style={{ opacity: 0.5 }}><path d="M4.5 0L0 6h3.5L3 10l5-6H4.5z" fill="#f59e0b"/></svg>
                  </span>
                </label>
              )}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Highlight</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {HIGHLIGHTS.map((h) => (
                    <div key={h.key} onClick={() => setForm({ ...form, highlight: h.key })}
                      style={{ width: 24, height: 24, borderRadius: "50%", background: h.key ? h.bg : "#fff", border: `2px solid ${form.highlight === h.key ? h.border : "#d1d5db"}`,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: form.highlight === h.key ? `0 0 0 2px ${h.border}40` : "none" }}>
                      {form.highlight === h.key && <span style={{ fontSize: 12, color: h.key ? h.border : "#64748b" }}>✓</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Tags</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", minHeight: 44, alignItems: "center" }}>
                  {form.tags.split(",").filter((s) => s.trim()).map((tag, i) => (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: tagColor(tag.trim()).bg, color: tagColor(tag.trim()).text, fontSize: 12, fontWeight: 600 }}>
                      {tag.trim()}
                      <span onClick={() => {
                        const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
                        tags.splice(i, 1);
                        setForm({ ...form, tags: tags.join(",") });
                      }} style={{ cursor: "pointer", fontSize: 14, lineHeight: 1, color: "#3b82f6", fontWeight: 700 }}>×</span>
                    </span>
                  ))}
                  <div style={{ position: "relative", flex: 1, minWidth: 80 }}>
                    <input value={tagInput}
                      onChange={(e) => { setTagInput(e.target.value); setTagSuggestions(true); }}
                      onFocus={() => setTagSuggestions(true)}
                      onBlur={() => setTimeout(() => setTagSuggestions(false), 150)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
                          e.preventDefault();
                          const v = tagInput.trim().replace(/,/g, "");
                          if (v) {
                            const existing = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
                            if (!existing.includes(v)) {
                              setForm({ ...form, tags: [...existing, v].join(",") });
                            }
                            setTagInput("");
                          }
                        } else if (e.key === "Backspace" && !tagInput) {
                          const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
                          if (tags.length) {
                            tags.pop();
                            setForm({ ...form, tags: tags.join(",") });
                          }
                        }
                      }}
                      placeholder={form.tags ? "" : "Add tag..."}
                      style={{ border: "none", outline: "none", fontSize: 13, width: "100%", background: "transparent", color: "#1e293b", padding: "2px 0" }} />
                    {tagSuggestions && tagInput && (() => {
                      const currentTags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
                      const filtered = allTags.filter((t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !currentTags.includes(t));
                      if (!filtered.length) return null;
                      return (
                        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 50, maxHeight: 150, overflowY: "auto", minWidth: 140 }}>
                          {filtered.map((tag) => (
                            <div key={tag} onMouseDown={() => {
                              const existing = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
                              setForm({ ...form, tags: [...existing, tag].join(",") });
                              setTagInput("");
                              setTagSuggestions(false);
                            }} style={{ padding: "6px 12px", fontSize: 12, cursor: "pointer", color: "#1e293b" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                              {tag}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
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

      {/* Recurring Prompt Popup */}
      {recurPrompt && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60 }}
          onClick={() => { setRecurPrompt(false); setPending(null); setRecurPopupPos(null); }}>
          <div style={{
            position: "fixed",
            ...(recurPopupPos
              ? { left: Math.min(recurPopupPos.x, window.innerWidth - 260), top: Math.min(recurPopupPos.y + 8, window.innerHeight - 160) }
              : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }),
            background: "#fff", borderRadius: 14, padding: "16px 18px", width: 240,
            boxShadow: "0 8px 30px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)",
            animation: "panelIn 0.12s ease",
          }}
            onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, letterSpacing: "-0.02em" }}>Recurring transaction</p>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>How should this change apply?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={() => { handleRecur("one"); setRecurPopupPos(null); }} className="bf-btn" style={{ padding: "9px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 12, fontWeight: 600, textAlign: "center" }}>Just this one</button>
              <button onClick={() => { handleRecur("future"); setRecurPopupPos(null); }} className="bf-btn" style={{ padding: "9px", borderRadius: 8, border: "none", background: C.blueDark, color: "#fff", fontSize: 12, fontWeight: 600, textAlign: "center" }}>This & future</button>
              <button onClick={() => { setRecurPrompt(false); setPending(null); setRecurPopupPos(null); }} className="bf-btn" style={{ border: "none", background: "none", color: "#94a3b8", fontSize: 11, cursor: "pointer", padding: "4px" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Advice Modal */}
      {adviceDay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, animation: "panelIn 0.18s ease" }}
          onClick={() => setAdviceDay(null)}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "28px 28px 24px", width: 460, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 8 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg> Fix {friendlyDate(adviceDay)}</span>
              <button onClick={() => setAdviceDay(null)} className="bf-btn" style={{ border: "none", background: "none", fontSize: 22, color: "#94a3b8", cursor: "pointer", padding: "2px 6px" }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 18, lineHeight: 1.5 }}>
              Balance goes to <strong style={{ color: C.redDark }}>{fmt(dayMap[adviceDay]?.balance ?? 0)}</strong> on this day. Here are strategies to stay positive:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {getAdvice(adviceDay).map((tip, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.4 }}>{tip.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.5 }}>{tip.text}</div>
                  </div>
                </div>
              ))}
              {getAdvice(adviceDay).length === 0 && (
                <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  No strategies found for this day.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {view === "calendar" && zoomWeek !== null && (() => {
        const wk = weeks[zoomWeek] || [];
        const weekDays = wk.map((day) => day ? dayMap[dkey(cY, cM, day)] : null);
        return (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexShrink: 0 }}>
              <button onClick={() => setZoomWeek(null)} className="bf-btn" style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${th.gridBorder}`, background: "#fff", fontSize: 12, fontWeight: 600, color: "#64748b" }}>← Month</button>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>
                Week of {wk.find(Boolean) ? `${MONTHS[cM]} ${wk.find(Boolean)}` : ""}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, flex: 1, minHeight: 0 }}>
              {DAY_NAMES.map((dn, i) => {
                const day = wk[i];
                const dd = day ? dayMap[dkey(cY, cM, day)] : null;
                const key = day ? dkey(cY, cM, day) : `empty-${i}`;
                const isToday = key === todayKey;
                const isPast = key < todayKey;
                if (!day) return <div key={key} style={{ background: "#f8fafc", borderRadius: 12, opacity: 0.3 }} />;
                return (
                  <div key={key} style={{ background: dd && dd.balance < 0 ? "#fff5f5" : th.calBg, border: `1px solid ${th.gridBorder}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", opacity: isPast ? 0.55 : 1 }}>
                    <div style={{ padding: "10px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${th.gridBorder}` }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>{dn}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: isToday ? th.accent : "#1e293b" }}>{day}</div>
                      </div>
                      {dd?.hasReset && <span style={{ fontSize: 9, fontWeight: 700, background: C.blueDark, color: "#fff", padding: "2px 6px", borderRadius: 4 }}>RST</span>}
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
                      {dd?.transactions.map((tx, ti) => (
                        <div key={ti} className="tx-chip" draggable onDragStart={(e) => onDragStart(e, tx, tx.occurrenceDate)}
                          onClick={(e) => { e.stopPropagation(); openEdit(tx, tx.occurrenceDate); }}
                          style={{ fontSize: 13, padding: "4px 8px", marginBottom: 4, borderRadius: 6,
                            background: (tx as any).highlight ? hlColor((tx as any).highlight).bg : "transparent",
                            display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 14, flexShrink: 0, fontSize: 13, color: tx.recurrence !== "none" ? "#64748b" : "transparent", lineHeight: 1, textAlign: "center" }}>{tx.recurrence !== "none" ? "↻" : ""}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: th.itemText }}>{tx.name}</span>
                          {(tx as any).autopay && <svg width="9" height="11" viewBox="0 0 8 10" style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.6 }}><path d="M4.5 0L0 6h3.5L3 10l5-6H4.5z" fill="#f59e0b"/></svg>}
                          <span style={{ marginLeft: (tx as any).autopay ? 2 : "auto", flexShrink: 0, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 12, color: tx.type === "income" ? C.greenDark : C.redDark }}>{fmt(Math.abs(tx.amount))}</span>
                        </div>
                      ))}
                      {(!dd || dd.transactions.length === 0) && <div style={{ color: "#cbd5e1", fontSize: 12, padding: "8px 0" }}>No transactions</div>}
                    </div>
                    <div onClick={(e) => { e.stopPropagation(); setResetDt(key); setResetAmt(""); openPanel("reset"); }}
                      style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: th.totalBg, borderTop: `1px solid ${th.totalBorder}`, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {dd && dd.balance < 0 && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>}
                      </div>
                      {dd && <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: dd.balance < 0 ? C.redDark : C.greenDark }}>{fmt(dd.balance)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      {view === "calendar" && zoomWeek === null && (
        <div style={{ overflowX: "auto", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: `45px repeat(${weeks.length}, 1fr)`, borderRadius: 14, overflow: "hidden", border: `1px solid ${th.gridBorder}`, flex: 1 }}>
            {DAYS.map((d, i) => (
              <div key={i} style={{ padding: "10px 4px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: th.dayBarText, textAlign: "center", background: th.dayBarBg, borderBottom: `1px solid ${th.dayBarBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{d}</div>
            ))}
            {weeks.map((wk, wi) =>
              wk.map((day, di) => {
                if (!day)
                  return (
                    <div key={`${wi}-${di}`} style={{ minHeight: 0, background: th.calBg, borderTop: `1px solid ${th.gridBorder}`, borderRight: di < 6 ? `1px solid ${th.gridBorder}` : "none", opacity: 0.5, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 4 }}>
                      {di === 0 && <button onClick={() => setZoomWeek(wi)} className="bf-btn" title="Week view" style={{ border: "none", background: "none", cursor: "pointer", padding: 2, opacity: 0.5 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>}
                    </div>
                  );
                const key = dkey(cY, cM, day);
                const dd = dayMap[key];
                const isToday = key === todayKey;
                const isPast = key < todayKey;
                const isSel = selDay === key;
                return (
                  <div key={key} className="cal-cell"
                    style={{ minHeight: 0,position: "relative", cursor: "pointer", overflow: "hidden",
                      opacity: isPast ? 0.55 : 1,
                      background: isSel ? "#f8fafc" : dd && dd.balance < 0 ? "#fff5f5" : "#fff",
                      borderTop: `1px solid ${th.gridBorder}`,
                      borderRight: di < 6 ? `1px solid ${th.gridBorder}` : "none",
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
                          <span onClick={(e) => { e.stopPropagation(); setZoomDay(key); }} className="day-num" style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: C.blueDark, width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>{day}<svg className="day-mag" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: -12, top: 2, display: "none" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
                        ) : (
                          <span onClick={(e) => { e.stopPropagation(); setZoomDay(key); }} className="day-num" style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", lineHeight: "22px", cursor: "pointer", position: "relative" }}>{day}<svg className="day-mag" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: -12, top: 2, display: "none" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
                        )}
                        {di === 0 && <button onClick={(e) => { e.stopPropagation(); setZoomWeek(wi); }} className="bf-btn" title="Week view" style={{ border: "none", background: "none", cursor: "pointer", padding: 1, opacity: 0.4, marginLeft: 2 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>}
                        {dd?.hasReset && <span style={{ fontSize: 8, fontWeight: 700, background: C.blueDark, color: "#fff", padding: "2px 5px", borderRadius: 4, letterSpacing: "0.04em" }}>RST</span>}
                      </div>
                      <div>
                        {dd?.transactions.map((tx, i) => (
                          <div key={i} className="tx-chip" draggable onDragStart={(e) => onDragStart(e, tx, tx.occurrenceDate)}
                            onClick={(e) => { e.stopPropagation(); openEdit(tx, tx.occurrenceDate); }}
                            style={{ fontSize, fontWeight: 500, padding: "2px 6px", marginTop: 2, borderRadius: 5,
                              background: (tx as any).highlight ? hlColor((tx as any).highlight).bg : "transparent",
                              color: th.itemText,
                              borderLeft: "none",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                              display: "flex", alignItems: "center", gap: 3 }}>
                            <span style={{ width: 14, flexShrink: 0, fontSize: 13, color: tx.recurrence !== "none" ? "#64748b" : "transparent", lineHeight: 1, textAlign: "center" }}>{tx.recurrence !== "none" ? "↻" : ""}</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{tx.name}</span>
                            {showTagPills && ((tx as any).tags || "").split(",").filter((s: string) => s.trim()).map((tag: string, ti: number) => (
                              <span key={ti} style={{ fontSize: fontSize - 2, padding: "1px 4px", borderRadius: 4, background: tagColor(tag.trim()).bg, color: tagColor(tag.trim()).text, flexShrink: 0, whiteSpace: "nowrap", fontWeight: 600 }}>{tag.trim()}</span>
                            ))}
                            {(tx as any).autopay && <svg width="8" height="10" viewBox="0 0 8 10" style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.6 }}><path d="M4.5 0L0 6h3.5L3 10l5-6H4.5z" fill="#f59e0b"/></svg>}
                            <span style={{ marginLeft: (tx as any).autopay ? 2 : "auto", flexShrink: 0, fontVariantNumeric: "tabular-nums", fontSize: fontSize - 1, color: tx.type === "income" ? C.greenDark : C.redDark }}>{fmtShort(Math.abs(tx.amount)).replace("$", "")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div onClick={(e) => { e.stopPropagation(); setResetDt(key); setResetAmt(""); openPanel("reset"); }}
                      style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, padding: "4px 6px", background: th.totalBg, borderTop: `1px solid ${th.totalBorder}`, cursor: "pointer" }}
                      title="Click to set balance reset">
                      {dd && dd.balance < 0 && <span onClick={(e) => { e.stopPropagation(); setAdviceDay(key); }} style={{ cursor: "pointer", marginRight: "auto", flexShrink: 0, display: "flex", alignItems: "center" }} title="Get advice"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span>}
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
        <div style={{ borderRadius: 14, border: "1px solid #e2e8f0", overflow: "auto", flex: 1, minHeight: 0, position: "relative" }}>
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
              <div key={dd.date} style={{ borderBottom: "1px solid #e2e8f0", opacity: dd.date < todayKey ? 0.55 : 1 }}>
                <div data-daydate={dd.date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", cursor: "pointer",
                    background: dropTgt === dd.date ? "#bfdbfe" : dd.date === todayKey ? "#f0f7ff" : dd.balance < 0 ? "#fff5f5" : "transparent",
                    ...(dropTgt === dd.date ? { outline: "2px solid #3b82f6", outlineOffset: -2 } : {}),
                    userSelect: "none", transition: "background 0.1s, outline 0.1s" }}
                  onClick={(e) => { toggleDay(e); }}
                  onDragOver={(e) => { e.preventDefault(); setDropTgt(dd.date); }}
                  onDragLeave={() => setDropTgt(null)}
                  onDrop={(e) => onDrop(e, dd.date)}>
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
                    {dd.balance < 0 && <span onClick={(e) => { e.stopPropagation(); setAdviceDay(dd.date); }} style={{ cursor: "pointer", flexShrink: 0, display: "inline-flex", alignItems: "center" }} title="Get advice"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span>}
                    {dd.balance < 0 && <span style={{ fontSize: 14 }}>😢</span>}
                    <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color: dd.balance < 0 ? C.redDark : C.greenDark }}>{fmt(dd.balance)}</span>
                  </div>
                </div>
                {isOpen && (
                  <>
                    {dd.transactions.map((tx, i) => (
                      <div key={i} className="list-row" draggable onDragStart={(e) => onDragStart(e, tx, tx.occurrenceDate)}
                        onClick={() => openEdit(tx, tx.occurrenceDate)}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 18px 8px 36px", cursor: "pointer", borderRadius: 0,
                          background: touchDrag && touchDrag.tx.id === tx.id && touchDrag.od === tx.occurrenceDate ? "#dbeafe" : (tx as any).highlight ? hlColor((tx as any).highlight).bg : "transparent",
                          ...(touchDrag && touchDrag.tx.id === tx.id && touchDrag.od === tx.occurrenceDate ? { outline: "2px solid #3b82f6", outlineOffset: -2 } : {}),
                        }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: tx.type === "income" ? C.green : C.red, flexShrink: 0 }} />
                          <span style={{ width: 18, flexShrink: 0, fontSize: 15, color: tx.recurrence !== "none" ? "#64748b" : "transparent", lineHeight: 1, textAlign: "center" }}>{tx.recurrence !== "none" ? "↻" : ""}</span>
                          <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#666677" }}>{tx.name}</span>
                          {showTagPills && ((tx as any).tags || "").split(",").filter((s: string) => s.trim()).map((tag: string, ti: number) => (
                            <span key={ti} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: tagColor(tag.trim()).bg, color: tagColor(tag.trim()).text, flexShrink: 0, whiteSpace: "nowrap", fontWeight: 600 }}>{tag.trim()}</span>
                          ))}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                          {(tx as any).autopay && <svg width="10" height="12" viewBox="0 0 8 10" style={{ opacity: 0.6 }}><path d="M4.5 0L0 6h3.5L3 10l5-6H4.5z" fill="#f59e0b"/></svg>}
                          <span style={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", color: tx.type === "income" ? C.greenDark : C.redDark }}>
                            {tx.type === "income" ? "+" : "-"}{fmt(Math.abs(tx.amount))}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, padding: "4px 18px", background: th.totalBg, borderTop: `1px solid ${th.totalBorder}` }}>
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

      {/* Footer */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, background: "#f1f5f9", borderRadius: 8, padding: 2 }}>
          <button onClick={() => setFontSize((s) => Math.max(8, s - 1))} className="bf-btn" style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", fontSize: 13, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>−</button>
          <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, minWidth: 14, textAlign: "center" }}>A</span>
          <button onClick={() => setFontSize((s) => Math.min(18, s + 1))} className="bf-btn" style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", fontSize: 13, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>+</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {Object.entries(THEMES).map(([key, t]) => (
            <div key={key} onClick={() => { setTheme(key); localStorage.setItem("flowycash-theme", key); }} title={t.name}
              style={{ width: 20, height: 20, borderRadius: "50%", background: t.swatch, cursor: "pointer",
                border: theme === key ? "2px solid #1e293b" : "2px solid transparent",
                boxShadow: theme === key ? "0 0 0 2px #fff, 0 0 0 4px #1e293b" : "none" }} />
          ))}
        </div>
        <button onClick={() => { setDemo((d) => { const v = !d; localStorage.setItem("flowycash-demo", String(v)); if (v && !demoState) setDemoState(buildDemoData()); return v; }); }} className="bf-btn"
          style={{ padding: "4px 12px", borderRadius: 20, border: demo ? "1.5px solid #fbbf24" : "1.5px solid #d1d5db", background: demo ? "#fef3c7" : "#fff", color: demo ? "#92400e" : "#64748b", fontSize: 10, fontWeight: 600, letterSpacing: "0.02em" }}>
          Demo
        </button>
      </div>

      {/* Touch drag ghost */}
      <div ref={ghostRef} style={{ display: "none", position: "fixed", pointerEvents: "none", zIndex: 100,
        background: "#fff", borderRadius: 8, padding: "6px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", border: "1.5px solid #3b82f6",
        fontSize: 13, fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap" }} />
    </div>
  );
}
