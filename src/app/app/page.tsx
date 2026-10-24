"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { UserButton, useAuth } from "@clerk/nextjs";
import { ensurePushSubscription } from "@/lib/push-client";
import type { Transaction, OverrideData, AppState } from "@/lib/types";
import { reconcile, type BankData } from "@/lib/reconcile";
import type { AssistantAction } from "@/app/api/assistant/route";
import PlaidDemo from "./PlaidDemo";
import { distributeDebt, simulateDistribution, type DebtPlacement } from "@/lib/debt-distribution";

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

const TAG_SVG: Record<string, string> = {
  income: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", // dollar
  housing: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10", // home
  debt: "M1 1h15v15H1z M5 1v15 M1 5h15 M9 1v15", // card grid
  subscriptions: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 8v8 M8 12h8", // app
  utilities: "M13 2L3 14h9l-1 8 10-12h-9l1-8", // bolt
  auto: "M16 3h-2l-2 7h8l-2-7h-2z M5 10h14l1 7H4l1-7z M6 17v2 M18 17v2", // car
  gas: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z M6 6h8 M6 10h8", // pump
  insurance: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", // shield
  pets: "M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M4 19c0-4 4-7 8-7s8 3 8 7", // paw-ish
  health: "M12 2v20 M2 12h20", // plus
  groceries: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18", // bag
  food: "M18 8h1a4 4 0 0 1 0 8h-1 M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z", // cup
  personal: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", // user
  allowance: "M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", // dollar
  savings: "M19 5h-4l-1-2H10L9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z M12 10v6 M9 13h6", // bank
  liquor: "M8 2h8l-1 5H9L8 2z M9 7v2a3 3 0 0 0 6 0V7 M12 9v13 M8 22h8", // glass
  tolls: "M4 4h16v16H4z M12 4v16 M4 12h16", // road
  loan: "M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3", // exchange
  shopping: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0", // bag
  "rent-income": "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78z M12 8l4-4", // key
};
const TAG_GUESSES: [RegExp, string][] = [
  [/rent|mortgage|hoa|lease|landlord/i, "housing"],
  [/netflix|spotify|hulu|disney|hbo|max\b|prime|youtube|apple|icloud|subscri|patreon|audible|kindle|chatgpt|claude|openai|adobe|dropbox|google one|paramount|peacock/i, "subscriptions"],
  [/electric|power|water|sewer|trash|internet|wifi|comcast|xfinity|spectrum|verizon|at&t|t-mobile|tmobile|phone|cell|fpl|duke|utility|utilities/i, "utilities"],
  [/insurance|geico|progressive|allstate|state farm|usaa|premium/i, "insurance"],
  [/\bgas\b|fuel|shell|exxon|chevron|bp\b|sunoco|wawa|racetrac|7-eleven/i, "gas"],
  [/\bcar\b|auto|toyota|honda|ford|tesla|oil change|tire|mechanic|dmv|registration/i, "auto"],
  [/\bvet\b|dog|cat\b|pet|chewy|groom|kennel|walker/i, "pets"],
  [/doctor|dentist|dental|pharmacy|cvs|walgreens|copay|co-pay|gym|clinic|therapy|medical|health|rx\b|vision|optom/i, "health"],
  [/grocer|publix|costco|walmart|aldi|trader|kroger|wegmans|whole foods|safeway|heb\b|sprouts|sam's|bj's|food lion/i, "groceries"],
  [/restaurant|dining|coffee|starbucks|dunkin|doordash|uber ?eats|grubhub|chipotle|mcdonald|chick|pizza|sushi|lunch|dinner|takeout|cafe|bar\b|brew/i, "food"],
  [/wine|liquor|beer|spirits|total wine|abc\b|vodka|whiskey|bourbon/i, "liquor"],
  [/toll|sunpass|e-?zpass|turnpike|parking/i, "tolls"],
  [/loan|credit card|visa|amex|mastercard|discover|capital one|chase|citi|affirm|klarna|afterpay|repay|debt|minimum payment/i, "debt"],
  [/salary|paycheck|payroll|direct deposit|wages|bi-?weekly|stipend|bonus|commission|refund|reimburse/i, "income"],
  [/amazon|target|ebay|etsy|best buy|home depot|lowe|ikea|wayfair|shop|store|mall|clothes|shoes|nike/i, "shopping"],
  [/saving|401k|ira\b|roth|brokerage|vanguard|fidelity|schwab|invest|emergency fund/i, "savings"],
  [/allowance|kids|child|daycare|tuition|school|camp\b/i, "allowance"],
  [/haircut|salon|barber|nails|spa\b|massage|gift|birthday|church|tithe|donation|charity/i, "personal"],
];
// Best-guess tag for an untagged item, from its name. Null when nothing matches.
function guessTag(name: string): string | null {
  for (const [re, tag] of TAG_GUESSES) if (re.test(name)) return tag;
  return null;
}
function TagIconSvg({ tag, size = 10 }: { tag: string; size?: number }) {
  const d = TAG_SVG[tag.toLowerCase()];
  if (!d) return null;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d={d} /></svg>;
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

function AuthUI({ headerText, isPro, onShare }: { headerText: string; isPro: boolean; onShare: () => void }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {isPro && (
        <button onClick={onShare} className="bf-btn" title="Share with partner"
          style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={headerText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        </button>
      )}
      {!isPro && (
        <button onClick={async () => {
          const res = await fetch("/api/stripe/checkout", { method: "POST" });
          const { url } = await res.json();
          if (url) window.location.href = url;
        }} className="bf-btn"
          style={{ padding: "4px 14px", borderRadius: 20, border: "1.5px solid #fbbf24", background: "#fef3c7", color: "#92400e", fontSize: 11, fontWeight: 700 }}>
          Upgrade Pro
        </button>
      )}
      {isPro && <span onClick={async () => {
        const res = await fetch("/api/stripe/portal", { method: "POST" });
        const { url } = await res.json();
        if (url) window.location.href = url;
      }} style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", background: "rgba(251,191,36,0.15)", padding: "3px 8px", borderRadius: 10, cursor: "pointer" }} title="Manage billing">PRO</span>}
      <UserButton  appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }} />
    </div>
  );
  return (
    <a href="/sign-in" className="bf-btn" style={{ padding: "4px 14px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: headerText, fontSize: 11, fontWeight: 600, textDecoration: "none" }}>Sign In</a>
  );
}

const DEF: AppState = { transactions: [], overrides: {}, balanceResets: {}, startingBalance: 0 };

interface DisplayTransaction extends Transaction {
  occurrenceDate: string;
  displayDate: string;
}

interface PendingAction {
  type: "edit" | "delete" | "move";
  tx: Transaction;
  occDate: string;
  formData?: { name: string; amount: number; type: string; autopay?: boolean; reminder?: boolean; tags?: string; highlight?: string; note?: string };
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
    ({ id: `demo-${++id}`, name, amount, type, recurrence, startDate, autopay, reminder: false, tags, highlight: "", note: "" });
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
  const [isPro, setIsPro] = useState(false);
  const { isSignedIn, isLoaded } = useAuth();
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
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "expense" | "income">("all");
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askReply, setAskReply] = useState("");
  const [askActions, setAskActions] = useState<AssistantAction[]>([]);
  const [askHistory, setAskHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [hidePastDays, setHidePastDays] = useState(true);
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
  const [showDashboard, setShowDashboard] = useState(false);
  const [chartMonths, setChartMonths] = useState(1);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showPlaidDemo, setShowPlaidDemo] = useState(false);
  const [calFeed, setCalFeed] = useState<{ open: boolean; url: string; webcal: string; error: string; copied: boolean }>({ open: false, url: "", webcal: "", error: "", copied: false });
  const [showMonthNote, setShowMonthNote] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(-1);
  const [shareMsg, setShareMsg] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sharedWith, setSharedWith] = useState<{ email: string }[]>([]);
  const [snapPreview, setSnapPreview] = useState<{ balance: number; date: string; moved: { name: string; from: string; to: string; amount: number; txId?: string; occurrenceDate?: string }[]; unaccounted: { name: string; amount: number; type: string; date: string }[]; imageUrl?: string } | null>(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapBank, setSnapBank] = useState<BankData | null>(null);
  const [snapThumb, setSnapThumb] = useState<string | undefined>(undefined);
  const [showAllResets, setShowAllResets] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [voiceResult, setVoiceResult] = useState("");
  const [monthNoteText, setMonthNoteText] = useState("");
  const [dropTgt, setDropTgt] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", amount: "", type: "expense", recurrence: "none", date: "", autopay: false, reminder: false, tags: "", highlight: "", note: "" });
  const [resetAmt, setResetAmt] = useState("");
  const [resetDt, setResetDt] = useState("");
  const [balInput, setBalInput] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtStep, setDebtStep] = useState(0);
  const [debtChunks, setDebtChunks] = useState<DebtPlacement[]>([]);
  const [debtName, setDebtName] = useState("Debt Repayment");

  const demoApi = useCallback(async (url: string, opts?: RequestInit) => {
    if (!demoState) return {};
    const body = opts?.body ? JSON.parse(opts.body as string) : {};
    const method = opts?.method || "GET";
    let ds = { ...demoState, transactions: [...demoState.transactions], overrides: { ...demoState.overrides }, balanceResets: { ...demoState.balanceResets } };

    if (url === "/api/transactions" && method === "POST") {
      ds.transactions.push({ id: `demo-${Date.now()}`, name: body.name, amount: body.amount, type: body.type, recurrence: body.recurrence || "none", startDate: body.startDate, autopay: body.autopay || false, reminder: body.reminder || false, tags: body.tags || "", highlight: body.highlight || "", note: body.note || "" });
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
    } else if (url === "/api/month-notes" && method === "POST") {
      if (!ds.monthNotes) ds.monthNotes = {};
      if (body.note) ds.monthNotes[body.month] = body.note;
      else delete ds.monthNotes[body.month];
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
      return;
    }
    const data = await api("/api/state");
    if (data && data.transactions) {
      setState(data);
    }
  }, [demo]);

  useEffect(() => {
    if (demo) {
      const ds = demoState || buildDemoData();
      if (!demoState) setDemoState(ds);
      setState(ds);
      setBalInput(String(ds.startingBalance || 0));
      setLoaded(true);
      return;
    }
    reload().then(() => {
      setLoaded(true);
    });
  }, [reload]);

  useEffect(() => {
    if (isLoaded) {
      setCM(new Date().getMonth());
      setCY(new Date().getFullYear());
      setZoomWeek(null);
      setZoomDay(null);
      reload();
    }
  }, [isSignedIn, isLoaded]);

  // All signed-in users get full access (Stripe paywall disabled for now)
  useEffect(() => {
    if (isSignedIn) {
      setIsPro(true);
      setDemo(false);
      localStorage.setItem("flowycash-demo", "false");
      // Refresh the push subscription if permission was already granted
      ensurePushSubscription(false).catch(() => {});
    } else {
      setIsPro(false);
    }
  }, [isSignedIn]);

  const rStart = dkey(cY, cM, 1);
  const rEnd = dkey(cY, cM, dim(cY, cM));

  const dailyData = useCallback(() => {
    const days = dim(cY, cM);
    const allDk: string[] = [];
    for (let d = 1; d <= days; d++) allDk.push(dkey(cY, cM, d));
    const txByDate: Record<string, DisplayTransaction[]> = {};
    allDk.forEach((k) => (txByDate[k] = []));
    (state.transactions || []).forEach((tx) => {
      const occs = getOccurrences(tx.startDate, tx.recurrence, rStart, rEnd, tx.endDate);
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
    // Compute carry-over balance: walk month by month from the earliest
    // transaction through the previous month, reusing the same logic
    let bal = state.startingBalance;
    const resets = state.balanceResets || {};
    const allTxs = (state.transactions || []);
    const allStarts = allTxs.map((t) => t.startDate).filter(Boolean).sort();
    const earliestDate = allStarts[0];
    if (earliestDate && earliestDate < dkey(cY, cM, 1)) {
      const startYear = parseInt(earliestDate.slice(0, 4));
      const startMonth = parseInt(earliestDate.slice(5, 7)) - 1;
      // Walk each prior month
      for (let y = startYear, m = startMonth; y < cY || (y === cY && m < cM); ) {
        const mStart = dkey(y, m, 1);
        const mEnd = dkey(y, m, dim(y, m));
        const mDays = dim(y, m);
        // Build txs by day for this month
        const mTxByDay: Record<string, number> = {};
        allTxs.forEach((tx) => {
          const occs = getOccurrences(tx.startDate, tx.recurrence, mStart, mEnd, tx.endDate);
          occs.forEach((odk) => {
            const ok = `${tx.id}::${odk}`;
            const ov = state.overrides[ok] as OverrideData | undefined;
            if (ov?.deleted) return;
            const disp = ov?.movedTo || odk;
            if (disp < mStart || disp > mEnd) return;
            const ovClean = ov ? Object.fromEntries(Object.entries(ov).filter(([, v]) => v != null)) : {};
            const eff = ov ? { ...tx, ...ovClean } : tx;
            const amt = ((eff.type || tx.type) === "income" ? 1 : -1) * Math.abs(eff.amount ?? tx.amount);
            mTxByDay[disp] = (mTxByDay[disp] || 0) + amt;
          });
        });
        for (let d = 1; d <= mDays; d++) {
          const dk = dkey(y, m, d);
          if (resets[dk] !== undefined) bal = resets[dk];
          if (mTxByDay[dk]) bal += mTxByDay[dk];
        }
        // Next month
        if (m === 11) { y++; m = 0; } else { m++; }
      }
    }
    const carryOver = Math.round(bal * 100) / 100;
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
    return { result, carryOver };
  }, [state, cY, cM, rStart, rEnd]);

  const { result: data, carryOver } = loaded ? dailyData() : { result: [], carryOver: 0 };
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

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setVoiceResult("Speech recognition not supported in this browser"); setTimeout(() => setVoiceResult(""), 3000); return; }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    setListening(true);
    setVoiceText("");
    setVoiceResult("");
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setVoiceText(t);
      if (e.results[0].isFinal) {
        setListening(false);
        setAskOpen(true);
        setAskText(t.trim());
        askAssistant(t.trim());
      }
    };
    rec.onerror = () => { setListening(false); setVoiceResult("Didn't catch that — try again"); setTimeout(() => setVoiceResult(""), 3000); };
    rec.onend = () => setListening(false);
    rec.start();
  }

  async function askAssistant(text: string) {
    const q = text.trim();
    if (!q || askBusy) return;
    setAskBusy(true);
    setAskReply("");
    setAskActions([]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: q, state, year: cY, month: cM, today: todayKey, demo, history: askHistory.slice(-6) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const reply: string = data.reply || "";
      const actions: AssistantAction[] = Array.isArray(data.actions) ? data.actions : [];
      const nav = actions.filter((a) => a.kind === "go_to_month" || a.kind === "show_day" || a.kind === "search");
      const edits = actions.filter((a) => !nav.includes(a));
      // Navigation and search need no confirmation.
      for (const a of nav) runNavAction(a);
      setAskReply(reply);
      setAskActions(edits);
      setAskHistory((h) => [...h, { role: "user" as const, text: q }, { role: "assistant" as const, text: reply }].slice(-8));
      setAskText("");
      setSearchQuery("");
    } catch (e) {
      setAskReply(`Couldn't reach the assistant: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAskBusy(false);
    }
  }

  function runNavAction(a: AssistantAction) {
    if (a.kind === "go_to_month" && a.date) {
      const { year, month } = pdk(a.date);
      setCY(year); setCM(month); setZoomWeek(null); setZoomDay(null);
    } else if (a.kind === "show_day" && a.date) {
      const { year, month } = pdk(a.date);
      setCY(year); setCM(month); setZoomWeek(null); setZoomDay(a.date);
    } else if (a.kind === "search" && a.query) {
      setAskOpen(true); setAskText(a.query); setSearchQuery(a.query);
    }
  }

  function describeAction(a: AssistantAction): string {
    const tx = state.transactions.find((t) => t.id === a.transactionId);
    const nm = a.name || tx?.name || "payment";
    const scope = a.scope === "future" ? " (this and all future)" : "";
    if (a.kind === "move") return `Move ${nm} from ${a.occurrenceDate ? friendlyDate(a.occurrenceDate) : "?"} to ${a.newDate ? friendlyDate(a.newDate) : "?"}${scope}`;
    if (a.kind === "set_amount") return `Change ${nm} on ${a.occurrenceDate ? friendlyDate(a.occurrenceDate) : "?"} to ${fmt(a.amount || 0)}${scope}`;
    if (a.kind === "skip") return `Skip ${nm} on ${a.occurrenceDate ? friendlyDate(a.occurrenceDate) : "?"}${scope}`;
    if (a.kind === "add") return `Add ${a.type === "income" ? "income" : "expense"} ${nm} ${fmt(a.amount || 0)} on ${a.date ? friendlyDate(a.date) : "?"}${a.recurrence && a.recurrence !== "none" ? `, ${a.recurrence}` : ""}`;
    return a.kind;
  }

  async function applyAskActions() {
    const acts = askActions;
    if (!acts.length) return;
    setAskBusy(true);
    const touched = new Set<string>();
    const dayBefore = (s: string) => { const { year, month, day } = pdk(s); const d = new Date(year, month, day); d.setDate(d.getDate() - 1); return dkey(d.getFullYear(), d.getMonth(), d.getDate()); };
    try {
      for (const a of acts) {
        const tx = state.transactions.find((t) => t.id === a.transactionId);
        if (a.kind === "add") {
          if (!a.name || !a.amount || !a.date) continue;
          await callApi("/api/transactions", { method: "POST", body: JSON.stringify({ name: a.name, amount: a.amount, type: a.type || "expense", recurrence: a.recurrence || "none", startDate: a.date, autopay: false, reminder: false, tags: "", highlight: "", note: "" }) });
          touched.add(a.date);
          continue;
        }
        if (!tx || !a.occurrenceDate) continue;
        const occ = a.occurrenceDate;
        const future = a.scope === "future" && tx.recurrence !== "none";
        if (a.kind === "move" && a.newDate) {
          if (tx.recurrence === "none") {
            await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ startDate: a.newDate }) });
          } else if (!future) {
            await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occ, movedTo: a.newDate }) });
          } else if (occ <= tx.startDate) {
            await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ startDate: a.newDate }) });
          } else {
            await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ endDate: dayBefore(occ) }) });
            await callApi("/api/transactions", { method: "POST", body: JSON.stringify({ name: tx.name, amount: tx.amount, type: tx.type, recurrence: tx.recurrence, startDate: a.newDate, autopay: tx.autopay ?? false, reminder: tx.reminder ?? false, tags: tx.tags ?? "", highlight: tx.highlight ?? "", note: tx.note ?? "" }) });
          }
          touched.add(occ); touched.add(a.newDate);
        } else if (a.kind === "set_amount" && a.amount != null) {
          if (tx.recurrence === "none" || future) {
            if (future && occ > tx.startDate) {
              await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ endDate: dayBefore(occ) }) });
              await callApi("/api/transactions", { method: "POST", body: JSON.stringify({ name: tx.name, amount: a.amount, type: tx.type, recurrence: tx.recurrence, startDate: occ, autopay: tx.autopay ?? false, reminder: tx.reminder ?? false, tags: tx.tags ?? "", highlight: tx.highlight ?? "", note: tx.note ?? "" }) });
            } else {
              await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ amount: a.amount }) });
            }
          } else {
            await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occ, amount: a.amount }) });
          }
          touched.add(occ);
        } else if (a.kind === "skip") {
          if (tx.recurrence === "none" || (future && occ <= tx.startDate)) {
            await callApi(`/api/transactions/${tx.id}`, { method: "DELETE" });
          } else if (future) {
            await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ endDate: dayBefore(occ) }) });
          } else {
            await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occ, deleted: true }) });
          }
          touched.add(occ);
        }
      }
      await reload();
      setExpandedDays((prev) => { const next = new Set(prev); touched.forEach((d) => next.add(d)); return next; });
      const first = Array.from(touched).sort()[0];
      if (first) { const { year, month } = pdk(first); if (year !== cY || month !== cM) { setCY(year); setCM(month); } }
      setAskActions([]);
      setAskReply("Done.");
    } catch (e) {
      setAskReply(`Couldn't apply that: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAskBusy(false);
    }
  }

  // A short phrase is a search; anything longer or with punctuation is for the assistant.
  function looksLikeSentence(q: string): boolean {
    return q.trim().split(/\s+/).length > 3 || /[?!.,]/.test(q);
  }
  function fuzzyMatch(q: string, target: string): boolean {
    if (!q) return true;
    const ql = q.toLowerCase().trim();
    const tl = target.toLowerCase();
    if (tl.includes(ql)) return true;
    // char-subsequence: every char of q must appear in target in order
    let i = 0;
    for (let j = 0; j < tl.length && i < ql.length; j++) if (tl[j] === ql[i]) i++;
    return i === ql.length;
  }
  const visibleTx = <T extends { type: string }>(txs: T[]) => filterType === "all" ? txs : txs.filter((t) => t.type === filterType);
  const txMatchesFilter = (tx: any) => {
    if (filterTag && !((tx.tags || "").split(",").map((s: string) => s.trim()).includes(filterTag))) return false;
    if (searchQuery.trim() && !fuzzyMatch(searchQuery, tx.name || "")) return false;
    return true;
  };

  const openPanel = (p: string) => {
    setPanel(p);
    setRecurPrompt(false);
  };
  function openAdd(date: string | null) {
    setEditTx(null);
    setEditDate(null);
    setForm({ name: "", amount: "", type: "expense", recurrence: "none", date: date || dkey(cY, cM, Math.min(new Date().getDate(), dim(cY, cM))), autopay: false, reminder: false, tags: "", highlight: "", note: "" });
    setTagInput("");
    openPanel("tx");
  }
  function openEdit(tx: Transaction, od: string) {
    setEditTx(tx);
    setEditDate(od);
    const ok = `${tx.id}::${od}`;
    const ov = state.overrides[ok] as OverrideData | undefined;
    const e = ov ? { ...tx, ...ov } : tx;
    setForm({ name: e.name || tx.name, amount: String(Math.abs(e.amount ?? tx.amount)), type: e.type || tx.type, recurrence: tx.recurrence, date: od, autopay: !!(tx as any).autopay, reminder: !!(tx as any).reminder, tags: (tx as any).tags || "", highlight: (tx as any).highlight || "", note: (tx as any).note || "" });
    setTagInput("");
    openPanel("tx");
  }

  async function handleSave() {
    const amt = parseFloat(form.amount);
    if (!form.name || isNaN(amt)) return;
    if (editTx) {
      const dateChanged = form.date !== editDate;
      const recurrenceChanged = form.recurrence !== editTx.recurrence;
      // If the recurrence type itself changed (none↔recurring, or weekly→monthly),
      // apply to the whole series — "just this one" makes no sense for a schedule change.
      if (recurrenceChanged) {
        await callApi(`/api/transactions/${editTx.id}`, { method: "PUT", body: JSON.stringify({
          name: form.name, amount: amt, type: form.type, recurrence: form.recurrence,
          startDate: form.date, autopay: form.autopay, reminder: form.reminder, tags: form.tags,
          highlight: form.highlight, note: form.note,
        }) });
        if (dateChanged) {
          setExpandedDays((prev) => { const next = new Set(prev); next.add(editDate!); next.add(form.date); return next; });
        }
        await reload();
        setPanel(null);
        return;
      }
      if (editTx.recurrence !== "none") {
        // Same recurrence type — save display properties + name directly on the base transaction
        await callApi(`/api/transactions/${editTx.id}`, { method: "PUT", body: JSON.stringify({ name: form.name, highlight: form.highlight, autopay: form.autopay, reminder: form.reminder, tags: form.tags, note: form.note }) });
        const amountChanged = amt !== Math.abs(editTx.amount);
        const typeChanged = form.type !== editTx.type;
        if (dateChanged || amountChanged || typeChanged) {
          if (dateChanged) {
            setPending({ type: "move", tx: editTx, occDate: editDate!, newDate: form.date });
          } else {
            setPending({ type: "edit", formData: { name: form.name, amount: amt, type: form.type, autopay: form.autopay, reminder: form.reminder, tags: form.tags, highlight: form.highlight, note: form.note }, tx: editTx, occDate: editDate! });
          }
          setRecurPrompt(true);
          setPanel(null);
          setExpandedDays((prev) => {
            const next = new Set(prev);
            next.add(editDate!);
            next.add(form.date);
            return next;
          });
          return;
        }
        await reload();
        setPanel(null);
        return;
      }
      // Non-recurring → non-recurring: update fields + move if date changed
      const body: Record<string, unknown> = { name: form.name, amount: amt, type: form.type, autopay: form.autopay, reminder: form.reminder, tags: form.tags, highlight: form.highlight, note: form.note };
      if (dateChanged) body.startDate = form.date;
      await callApi(`/api/transactions/${editTx.id}`, { method: "PUT", body: JSON.stringify(body) });
      if (dateChanged) {
        setExpandedDays((prev) => {
          const next = new Set(prev);
          next.add(editDate!);
          next.add(form.date);
          return next;
        });
      }
    } else {
      await callApi("/api/transactions", { method: "POST", body: JSON.stringify({ name: form.name, amount: amt, type: form.type, recurrence: form.recurrence, startDate: form.date, autopay: form.autopay, reminder: form.reminder, tags: form.tags, highlight: form.highlight, note: form.note }) });
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
    const dayBefore = (s: string) => {
      const { year, month, day } = pdk(s);
      const d = new Date(year, month, day);
      d.setDate(d.getDate() - 1);
      return dkey(d.getFullYear(), d.getMonth(), d.getDate());
    };
    if (type === "delete") {
      if (choice === "one") {
        await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occDate, deleted: true }) });
      } else {
        // "This & future": cap the series the day before occDate; past occurrences preserved.
        // If occDate is on/before startDate, nothing in the past — delete the whole row.
        if (occDate <= tx.startDate) {
          await callApi(`/api/transactions/${tx.id}`, { method: "DELETE" });
        } else {
          await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ endDate: dayBefore(occDate) }) });
        }
      }
    } else if (type === "edit") {
      const fd = pending.formData!;
      if (choice === "one") {
        await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occDate, name: fd.name, amount: fd.amount, type: fd.type }) });
      } else {
        // "This & future": cap original at day-before occDate, create new tx starting at occDate
        // with new values + same recurrence. If occDate is on/before startDate, just edit in place.
        if (occDate <= tx.startDate) {
          await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ name: fd.name, amount: fd.amount, type: fd.type, autopay: fd.autopay, reminder: fd.reminder, tags: fd.tags, highlight: fd.highlight, note: fd.note }) });
        } else {
          await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ endDate: dayBefore(occDate) }) });
          await callApi("/api/transactions", { method: "POST", body: JSON.stringify({ name: fd.name, amount: fd.amount, type: fd.type, recurrence: tx.recurrence, startDate: occDate, autopay: fd.autopay, reminder: fd.reminder, tags: fd.tags, highlight: fd.highlight, note: fd.note }) });
        }
      }
    } else if (type === "move") {
      const newDate = pending.newDate!;
      if (choice === "one") {
        await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: tx.id, occurrenceDate: occDate, movedTo: newDate }) });
      } else {
        // "This & future" move: cap original, create new series starting at newDate.
        // If occDate is on/before startDate, just shift startDate.
        if (occDate <= tx.startDate) {
          await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ startDate: newDate }) });
        } else {
          await callApi(`/api/transactions/${tx.id}`, { method: "PUT", body: JSON.stringify({ endDate: dayBefore(occDate) }) });
          await callApi("/api/transactions", { method: "POST", body: JSON.stringify({ name: tx.name, amount: tx.amount, type: tx.type, recurrence: tx.recurrence, startDate: newDate, autopay: (tx as any).autopay ?? false, reminder: (tx as any).reminder ?? false, tags: (tx as any).tags ?? "", highlight: (tx as any).highlight ?? "", note: (tx as any).note ?? "" }) });
        }
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

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(file);
    });
  }

  function openResetPanel(dateKey: string) {
    setResetDt(dateKey);
    setResetAmt("");
    setSnapBank(null);
    setSnapThumb(undefined);
    openPanel("reset");
  }

  // Merge freshly-parsed bank data into the accumulator so an accounts screenshot,
  // transaction screenshots, and a CSV can all feed one reconciliation pass.
  async function addBankSource(fetchBank: () => Promise<BankData>, thumb?: string) {
    setSnapLoading(true);
    try {
      const parsed = await fetchBank();
      setSnapBank((prev) => ({
        accounts: [...(prev?.accounts || []), ...(parsed.accounts || [])],
        transactions: [...(prev?.transactions || []), ...(parsed.transactions || [])],
      }));
      if (thumb) setSnapThumb((prev) => prev || thumb);
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "";
      setShareMsg(msg ? `Reconcile failed: ${msg}` : "Couldn't read that file — try another screenshot or CSV");
      setTimeout(() => setShareMsg(""), 6000);
    } finally {
      setSnapLoading(false);
    }
  }

  async function onSnapImages(files: FileList) {
    const arr = Array.from(files).slice(0, 6);
    if (!arr.length) return;
    const previewUrl = URL.createObjectURL(arr[0]);
    await addBankSource(async () => {
      const images = await Promise.all(arr.map(async (f) => ({ base64: await fileToBase64(f), mediaType: f.type || "image/png" })));
      const res = await api("/api/reconcile/image", { method: "POST", body: JSON.stringify({ images }) });
      if (res.error) throw new Error(res.error);
      return res as BankData;
    }, previewUrl);
  }

  async function onSnapCsv(file: File) {
    const text = await file.text();
    await addBankSource(async () => {
      const res = await api("/api/reconcile/csv", { method: "POST", body: JSON.stringify({ csv: text }) });
      if (res.error) throw new Error(res.error);
      return res as BankData;
    });
  }

  function reviewSnap() {
    if (!snapBank) return;
    const result = reconcile(snapBank, state);
    setSnapPreview({ ...result, imageUrl: snapThumb });
    setPanel(null);
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

  async function handleDebtConfirm() {
    const chunks = debtChunks.filter((c) => c.amount > 0 && c.date);
    if (!chunks.length) return;
    for (const c of chunks) {
      await callApi("/api/transactions", { method: "POST", body: JSON.stringify({ name: debtName || "Debt Repayment", amount: c.amount, type: "expense", recurrence: "none", startDate: c.date, tags: "debt" }) });
    }
    await reload();
    setExpandedDays((prev) => { const next = new Set(prev); chunks.forEach((c) => next.add(c.date)); return next; });
    setPanel(null);
    setDebtStep(0);
    setDebtAmount("");
    setDebtChunks([]);
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

  const buildForecast = (months: number) => {
        // Compute 90 days of daily balances starting from today
        const today = new Date();
        const allTxs = (state.transactions || []);
        const mResets = state.balanceResets || {};

        // First compute today's starting balance by walking from earliest tx
        let startBal = state.startingBalance;
        const allStarts = allTxs.map((t) => t.startDate).filter(Boolean).sort();
        const earliest = allStarts[0];
        const todayKey2 = dkey(today.getFullYear(), today.getMonth(), today.getDate());
        if (earliest && earliest < todayKey2) {
          const sD = new Date(parseInt(earliest.slice(0,4)), parseInt(earliest.slice(5,7))-1, parseInt(earliest.slice(8,10)));
          for (let cur = new Date(sD); cur < today; cur.setDate(cur.getDate() + 1)) {
            const dk = dkey(cur.getFullYear(), cur.getMonth(), cur.getDate());
            if (mResets[dk] !== undefined) startBal = mResets[dk];
            const mStart = dkey(cur.getFullYear(), cur.getMonth(), 1);
            const mEnd = dkey(cur.getFullYear(), cur.getMonth(), dim(cur.getFullYear(), cur.getMonth()));
            allTxs.forEach((tx) => {
              const occs = getOccurrences(tx.startDate, tx.recurrence, mStart, mEnd, tx.endDate);
              occs.forEach((odk) => {
                if (odk !== dk) return;
                const ok = `${tx.id}::${odk}`;
                const ov = state.overrides[ok] as OverrideData | undefined;
                if (ov?.deleted) return;
                const disp = ov?.movedTo || odk;
                if (disp !== dk) return;
                const ovClean = ov ? Object.fromEntries(Object.entries(ov).filter(([, v]) => v != null)) : {};
                const eff = ov ? { ...tx, ...ovClean } : tx;
                startBal += ((eff.type || tx.type) === "income" ? 1 : -1) * Math.abs(eff.amount ?? tx.amount);
              });
            });
          }
        }

        // Now generate 90 days from today
        const daysN: { date: string; bal: number; month: number; day: number; monthName: string }[] = [];
        let bal90 = startBal;
        const totalChartDays = months * 30;
        for (let i = 0; i < totalChartDays; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() + i);
          const dk = dkey(d.getFullYear(), d.getMonth(), d.getDate());
          if (mResets[dk] !== undefined) bal90 = mResets[dk];
          const mStart = dkey(d.getFullYear(), d.getMonth(), 1);
          const mEnd = dkey(d.getFullYear(), d.getMonth(), dim(d.getFullYear(), d.getMonth()));
          allTxs.forEach((tx) => {
            const occs = getOccurrences(tx.startDate, tx.recurrence, mStart, mEnd, tx.endDate);
            occs.forEach((odk) => {
              if (odk !== dk) return;
              const ok = `${tx.id}::${odk}`;
              const ov = state.overrides[ok] as OverrideData | undefined;
              if (ov?.deleted) return;
              const disp = ov?.movedTo || odk;
              if (disp !== dk) return;
              const ovClean = ov ? Object.fromEntries(Object.entries(ov).filter(([, v]) => v != null)) : {};
              const eff = ov ? { ...tx, ...ovClean } : tx;
              bal90 += ((eff.type || tx.type) === "income" ? 1 : -1) * Math.abs(eff.amount ?? tx.amount);
            });
          });
          daysN.push({ date: dk, bal: Math.round(bal90 * 100) / 100, month: d.getMonth(), day: d.getDate(), monthName: MONTHS[d.getMonth()] });
        }

        const allBals = daysN.map((d) => d.bal);
        const maxB = Math.max(...allBals, 0);
        const minB = Math.min(...allBals, 0);
        const range = maxB - minB || 1;
        const negDaysN = daysN.filter((d) => d.bal < 0);
        const lowDayN = daysN.reduce((min, d) => d.bal < min.bal ? d : min, daysN[0]);
        const cw = 900, ch = 220, padL = 55, padT = 10, padB = 30;
        const chartW = cw - padL, chartH = ch - padT - padB;
        const zeroY = padT + ((maxB - 0) / range) * chartH;

        // Month boundaries
        const monthBounds: { month: string; startIdx: number }[] = [];
        let prevMonth = -1;
        daysN.forEach((d, i) => { if (d.month !== prevMonth) { monthBounds.push({ month: d.monthName, startIdx: i }); prevMonth = d.month; } });

        // Points for chart
        const pts90 = daysN.map((d, i) => ({
          x: padL + (i / (daysN.length - 1)) * chartW,
          y: padT + ((maxB - d.bal) / range) * chartH,
          ...d,
        }));
        const line90 = pts90.map((p) => `${p.x},${p.y}`).join(" ");
        const area90 = [...pts90.map((p) => `${p.x},${p.y}`), `${pts90[pts90.length-1].x},${zeroY}`, `${pts90[0].x},${zeroY}`].join(" ");
    return { daysN, totalChartDays, maxB, minB, negDaysN, lowDayN, cw, ch, padL, padT, padB, chartW, zeroY, monthBounds, pts90, line90, area90 };
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
    * { box-sizing: border-box; margin: 0; }
    @keyframes panelIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
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
    .cal-cell:hover .cell-plus { opacity: 1 !important; }
    .cell-addbtn:hover { transform: scale(1.4); background: #e2e8f0; }
    .tx-chip { transition: all 0.1s; cursor: grab; }
    .tx-chip:hover { background: #eef2ff !important; outline: 1.5px solid #818cf8; outline-offset: -1px; border-radius: 5px; }
    .list-row { transition: all 0.1s; }
    .list-row:hover { background: #eef2ff !important; outline: 1.5px solid #818cf8; outline-offset: -1px; }
    .tag-pill:hover .tag-popup { display: block !important; }
    .tag-pill:hover { background: #f1f5f9 !important; border-color: #cbd5e1 !important; }
    .stat-pill:hover .stat-popup { display: block !important; }
    .stat-pill:hover { background: #f8fafc !important; }
    .day-num:hover .day-mag { display: inline !important; }
    @keyframes askdot { 0%, 80%, 100% { transform: translateY(0); opacity: 0.35; } 40% { transform: translateY(-4px); opacity: 1; } }
    .ask-dots span { display: inline-block; width: 6px; height: 6px; border-radius: 50%; animation: askdot 1.1s infinite ease-in-out; }
    .ask-dots span:nth-child(2) { animation-delay: 0.15s; }
    .ask-dots span:nth-child(3) { animation-delay: 0.3s; }
    .ask-fab { display: none; }
    @media (max-width: 999px) { .ask-fab { display: flex; } }
    @media (max-width: 600px) { .footer-debt { display: none; } }
  `;

  const th = THEMES[theme] || THEMES.forest;

  const C = {
    green: "#10b981", greenDark: "#059669", greenBg: "rgba(16,185,129,0.08)", greenBorder: "rgba(16,185,129,0.2)",
    red: "#ef4444", redDark: "#dc2626", redBg: "rgba(239,68,68,0.06)", redBorder: "rgba(239,68,68,0.2)",
    blue: "#3b82f6", blueDark: "#2563eb", blueBg: "rgba(59,130,246,0.06)", blueBorder: "rgba(59,130,246,0.2)",
  };

  // Signed out and not in demo: say so instead of showing an empty $0 calendar
  // that looks like a wiped account.
  if (isLoaded && !isSignedIn && !demo)
    return (
      <div style={{ fontFamily: 'var(--font-inter), Inter, sans-serif', minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{css}</style>
        <div style={{ background: "#fff", borderRadius: 20, padding: "36px 32px", width: 420, maxWidth: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0", textAlign: "center" }}>
          <img src="/logo.png" alt="Flowy Cash" style={{ width: 120, marginBottom: 18 }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", letterSpacing: "-0.02em", marginBottom: 8 }}>Sign in to see your calendar</div>
          <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.5, marginBottom: 24 }}>Your payments, balances, and forecast are saved to your account. Nothing shows here until you sign in.</div>
          <a href="/sign-in" style={{ display: "block", background: th.headerBg, color: "#fff", borderRadius: 12, padding: "14px 18px", fontSize: 15, fontWeight: 700, textDecoration: "none", marginBottom: 10 }}>Sign in</a>
          <button onClick={() => { localStorage.setItem("flowycash-demo", "true"); if (!demoState) setDemoState(buildDemoData()); setDemo(true); }} className="bf-btn"
            style={{ width: "100%", background: "#fff", color: "#64748b", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Try the demo instead
          </button>
        </div>
      </div>
    );

  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, sans-serif', width: "100%", margin: 0, padding: "24px 32px", color: "#1e293b", height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{css}</style>

      {/* Header */}
      <div style={{ flexShrink: 0, background: th.headerBg, borderRadius: 14, padding: "12px 20px", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span data-tour="logo" style={{ cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }} onClick={() => { setCM(new Date().getMonth()); setCY(new Date().getFullYear()); setZoomWeek(null); }}>flowycash</span>
          <button onClick={prevM} className="bf-btn bf-monthnav" style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", fontSize: 22, color: th.headerText, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>‹</button>
          <span data-tour="month" onClick={() => { const mk = `${cY}-${String(cM + 1).padStart(2, "0")}`; setMonthNoteText((state.monthNotes || {})[mk] || ""); setShowMonthNote(true); }}
            style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {MONTHS[cM]} {cY}
            {(state.monthNotes || {})[`${cY}-${String(cM + 1).padStart(2, "0")}`] && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
          </span>
          <button onClick={nextM} className="bf-btn bf-monthnav" style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", fontSize: 22, color: th.headerText, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>›</button>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button data-tour="tags" onClick={() => setShowTagPills((v) => !v)} className="bf-btn" title="Tags"
              style={{ width: 32, height: 32, borderRadius: "50%", border: showTagPills ? `1.5px solid ${th.accent}` : "1.5px solid rgba(255,255,255,0.3)", background: showTagPills ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showTagPills ? th.headerBg : th.headerText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            </button>
            <button onClick={() => setAskOpen((v) => !v)} className="bf-btn" title="Search, ask, or tell Flowy"
              style={{ width: 32, height: 32, borderRadius: "50%", border: askOpen ? `1.5px solid ${th.accent}` : "1.5px solid rgba(255,255,255,0.3)", background: askOpen ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={askOpen ? th.headerBg : th.headerText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>
            </button>
            <button data-tour="dashboard" onClick={() => setShowDashboard(true)} className="bf-btn" title="Reports"
              style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={th.headerText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="11" width="3" height="7"/><rect x="11" y="6" width="3" height="12"/><rect x="16" y="9" width="3" height="9"/></svg>
            </button>
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
              {pills.map(({ label, val, color, border, items }) => {
                const kind = label === "In" ? "income" : "expense";
                const active = filterType === kind;
                return (
                <div key={label} className="stat-pill" onClick={() => setFilterType(active ? "all" : kind)} title={active ? "Show everything" : `Show ${kind === "income" ? "income" : "expenses"} only`}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: active ? border : "#fff", border: `1.5px solid ${border}`, position: "relative", cursor: "pointer", boxShadow: active ? "0 0 0 2px rgba(255,255,255,0.6)" : "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: active ? "#fff" : "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: active ? "#fff" : color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{val}</span>
                  {items.length > 0 && <span style={{ fontSize: 8, color: active ? "#fff" : "#94a3b8", lineHeight: 1 }}>▼</span>}
                  {items.length > 0 && (
                  <div className="stat-popup" style={{ display: "none", position: "absolute", top: "100%", right: 0, marginTop: 4, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "10px 14px", zIndex: 40, minWidth: 240, maxHeight: 350, overflowY: "auto" }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0", fontSize: 12 }}>
                        <span style={{ color: "#666677" }}>{item.name}</span>
                        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: item.color, whiteSpace: "nowrap" }}>{item.val}</span>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
                );
              })}
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
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.2)", margin: "0 8px" }} />
          <AuthUI headerText={th.headerText} isPro={isPro} onShare={() => {
            fetch("/api/share").then((r) => r.json()).then((d) => setSharedWith(Array.isArray(d) ? d.map((s: any) => ({ email: s.sharedEmail })) : []));
            setShowShare(true);
          }} />
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, flexShrink: 0, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 2 }}>Tags</span>
            {sorted.map(([tag, { income, expense, items }]) => (
              <div key={tag} className="tag-pill" onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: filterTag === tag ? tagColor(tag).text : "#fff", border: `1px solid ${filterTag === tag ? tagColor(tag).text : "#e2e8f0"}`, fontSize: 12, position: "relative", cursor: "pointer", color: filterTag === tag ? "#fff" : "#334155", transition: "all 0.15s" }}>
                <span style={{ color: filterTag === tag ? "#fff" : tagColor(tag).text, display: "flex", alignItems: "center" }}><TagIconSvg tag={tag} size={11} /></span>
                <span style={{ fontWeight: 600 }}>{tag}</span>
                <span style={{ fontWeight: 600, color: filterTag === tag ? "#fff" : "#64748b", fontVariantNumeric: "tabular-nums" }}>{expense > 0 && income > 0 ? `${fmtShort(income)} / ${fmtShort(expense)}` : fmtShort(expense || income)}</span>
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

      {/* Pro upgrade banner */}
      {isSignedIn && !isPro && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "10px 16px", marginBottom: 6, background: "linear-gradient(90deg, #fef3c7, #fff7ed)", borderRadius: 10, border: "1px solid #fde68a" }}>
          <span style={{ fontSize: 13, color: "#92400e", fontWeight: 600 }}>You're viewing demo data. Upgrade to Pro to use your own transactions.</span>
          <button onClick={async () => {
            const res = await fetch("/api/stripe/checkout", { method: "POST" });
            const { url } = await res.json();
            if (url) window.location.href = url;
          }} className="bf-btn"
            style={{ padding: "6px 18px", borderRadius: 10, border: "none", background: "#92400e", color: "#fff", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
            Upgrade Pro — $9/mo
          </button>
        </div>
      )}

      {/* Ask bar: type or dictate a question or a change */}
      {askOpen && (
        <div style={{ flexShrink: 0, marginBottom: 8, background: "#fff", borderRadius: 12, border: `1.5px solid ${th.accent}44`, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
          <form onSubmit={(e) => { e.preventDefault(); askAssistant(askText); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={th.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <input autoFocus value={askText} onChange={(e) => { setAskText(e.target.value); setSearchQuery(looksLikeSentence(e.target.value) ? "" : e.target.value); setAskReply(""); setAskActions([]); }} disabled={askBusy}
              onKeyDown={(e) => { if (e.key === "Escape") { setAskOpen(false); setAskText(""); setSearchQuery(""); setAskReply(""); setAskActions([]); } }}
              placeholder="Search, ask, or tell Flowy: mortgage · where is rent this month? · move Bob to Tuesday"
              style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 15, color: "#1e293b", outline: "none", fontFamily: "inherit" }} />
            <button type="button" onClick={startListening} className="bf-btn" title="Speak"
              style={{ width: 30, height: 30, borderRadius: "50%", border: listening ? "1.5px solid #ef4444" : "1.5px solid #e2e8f0", background: listening ? "#fee2e2" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, animation: listening ? "pulse 1s infinite" : "none" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={listening ? "#ef4444" : "#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </button>
            <button type="submit" disabled={askBusy || !askText.trim()} className="bf-btn" style={{ border: "none", borderRadius: 8, padding: "6px 12px", background: askBusy || !askText.trim() ? "#e2e8f0" : th.accent, color: askBusy || !askText.trim() ? "#94a3b8" : "#fff", fontSize: 13, fontWeight: 700 }}>{askBusy ? "Thinking" : "Ask"}</button>
            <button type="button" onClick={() => { setAskOpen(false); setAskText(""); setSearchQuery(""); setAskReply(""); setAskActions([]); }} className="bf-btn" style={{ border: "none", background: "none", color: "#94a3b8", fontSize: 16, cursor: "pointer", padding: "0 4px", fontWeight: 700 }}>×</button>
          </form>
          {askBusy && (
            <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
              <span className="ask-dots" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <span style={{ background: th.accent }} /><span style={{ background: th.accent }} /><span style={{ background: th.accent }} />
              </span>
              <span style={{ fontSize: 13, color: "#64748b" }}>Reading your calendar and working it out…</span>
            </div>
          )}
          {!askBusy && (askReply || askActions.length > 0) && (
            <div style={{ borderTop: "1px solid #f1f5f9", padding: "10px 14px 12px" }}>
              {askReply && <div style={{ fontSize: 14, color: "#1e293b", lineHeight: 1.5 }}>{askReply}</div>}
              {askActions.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {askActions.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13, color: "#334155" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: th.accent, flexShrink: 0 }} />
                      {describeAction(a)}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={applyAskActions} disabled={askBusy} className="bf-btn" style={{ border: "none", borderRadius: 8, padding: "8px 16px", background: th.accent, color: "#fff", fontSize: 13, fontWeight: 700 }}>{askBusy ? "Applying…" : "Apply"}</button>
                    <button onClick={() => { setAskActions([]); setAskReply(""); }} disabled={askBusy} className="bf-btn" style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600 }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search results: where each match falls this month, or the next time it falls */}
      {askOpen && searchQuery.trim() && !askBusy && !askReply && (() => {
        const hits = data.flatMap((dd) => dd.transactions.filter((tx) => fuzzyMatch(searchQuery, tx.name || "")).map((tx) => ({ tx, date: dd.date })));
        if (hits.length === 0) {
          const nextStart = dkey(cM === 11 ? cY + 1 : cY, cM === 11 ? 0 : cM + 1, 1);
          const farY = cM + 6 > 11 ? cY + 1 : cY; const farM = (cM + 6) % 12;
          const upcoming = state.transactions.filter((tx) => fuzzyMatch(searchQuery, tx.name || ""))
            .flatMap((tx) => getOccurrences(tx.startDate, tx.recurrence, nextStart, dkey(farY, farM, dim(farY, farM)), tx.endDate).map((d) => ({ tx, date: (state.overrides[`${tx.id}::${d}`] as OverrideData | undefined)?.movedTo || d })))
            .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
          return (
            <div style={{ flexShrink: 0, padding: "6px 10px", marginBottom: 6, fontSize: 12, color: "#64748b", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              Nothing matching &ldquo;{searchQuery}&rdquo; in {MONTHS[cM]}.
              {upcoming.length > 0 && <> Next: {upcoming.map((u, i) => <span key={i}><button onClick={() => { const { year, month } = pdk(u.date); setCY(year); setCM(month); setZoomDay(u.date); }} className="bf-btn" style={{ border: "none", background: "none", padding: 0, color: th.accent, fontWeight: 600, fontSize: 12, textDecoration: "underline" }}>{u.tx.name} on {friendlyDate(u.date)}</button>{i < upcoming.length - 1 ? ", " : ""}</span>)}</>}
            </div>
          );
        }
        return (
          <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, marginTop: -2 }}>
            {hits.map(({ tx, date }, i) => (
              <button key={i} onClick={() => { setZoomDay(date); setExpandedDays((prev) => new Set(prev).add(date)); }} className="bf-btn"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, color: "#1e293b" }}>
                <span style={{ fontWeight: 600 }}>{tx.name}</span>
                <span style={{ color: "#64748b" }}>{friendlyDate(date)}</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: tx.type === "income" ? C.greenDark : C.redDark }}>{fmt(Math.abs(tx.amount))}</span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* Type filter indicator */}
      {filterType !== "all" && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", marginBottom: 4, background: filterType === "expense" ? C.redBg : C.greenBg, borderRadius: 8, border: `1px solid ${filterType === "expense" ? C.redBorder : C.greenBorder}` }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: filterType === "expense" ? C.redDark : C.greenDark }}>Showing {filterType === "expense" ? "expenses" : "income"} only</span>
          <button onClick={() => setFilterType("all")} className="bf-btn" style={{ border: "none", background: "none", color: filterType === "expense" ? C.redDark : C.greenDark, fontSize: 14, cursor: "pointer", padding: "0 4px", fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Filter indicator */}
      {filterTag && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", marginBottom: 4, background: tagColor(filterTag).bg, borderRadius: 8, border: `1px solid ${tagColor(filterTag).text}33` }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: tagColor(filterTag).text, display: "flex", alignItems: "center", gap: 4 }}>
            <TagIconSvg tag={filterTag} size={12} /> Filtering: {filterTag}
          </span>
          <button onClick={() => setFilterTag(null)} className="bf-btn" style={{ border: "none", background: "none", color: tagColor(filterTag).text, fontSize: 14, cursor: "pointer", padding: "0 4px", fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Old inline chart removed — now using modal */}
      {false && (() => {
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

      {/* Month Note Modal */}
      {showMonthNote && (() => {
        const mk = `${cY}-${String(cM + 1).padStart(2, "0")}`;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, animation: "panelIn 0.18s ease" }}
            onClick={() => setShowMonthNote(false)}>
            <div style={{ background: "#fff", borderRadius: 20, padding: "28px 28px 24px", width: 440, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
              onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{MONTHS[cM]} {cY} Notes</span>
                <button onClick={() => setShowMonthNote(false)} className="bf-btn" style={{ border: "none", background: "none", fontSize: 22, color: "#94a3b8", cursor: "pointer" }}>×</button>
              </div>
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Add goals, reminders, or observations for this month.</p>
              <textarea autoFocus value={monthNoteText} onChange={(e) => setMonthNoteText(e.target.value)}
                placeholder="e.g. Extra car payment this month, vacation budget, watch the credit card..."
                className="bf-input" style={{ fontSize: 14, padding: "12px 16px", minHeight: 100, resize: "vertical", marginBottom: 12 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={async () => {
                  await callApi("/api/month-notes", { method: "POST", body: JSON.stringify({ month: mk, note: monthNoteText }) });
                  await reload();
                  setShowMonthNote(false);
                }} className="bf-btn" style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: th.headerBg, color: "#fff", fontSize: 14, fontWeight: 600 }}>
                  Save
                </button>
                {monthNoteText && (
                  <button onClick={async () => {
                    setMonthNoteText("");
                    await callApi("/api/month-notes", { method: "POST", body: JSON.stringify({ month: mk, note: "" }) });
                    await reload();
                    setShowMonthNote(false);
                  }} className="bf-btn" style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 500 }}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Dashboard Modal */}
      {showDashboard && (() => {
        const balances = data.map((d) => d.balance);
        const maxB = Math.max(...balances, 0);
        const minB = Math.min(...balances, 0);
        const negDays = data.filter((d) => d.balance < 0);
        const posDays = data.filter((d) => d.balance >= 0);
        const avgBal = balances.length ? balances.reduce((a, b) => a + b, 0) / balances.length : 0;
        const lowDay = data.reduce((min, d) => d.balance < min.balance ? d : min, data[0]);
        const highDay = data.reduce((max, d) => d.balance > max.balance ? d : max, data[0]);

        // Top expenses
        const expMap: Record<string, number> = {};
        data.forEach((d) => d.transactions.filter((t) => t.type === "expense").forEach((t) => { expMap[t.name] = (expMap[t.name] || 0) + Math.abs(t.amount); }));
        const topExp = Object.entries(expMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

        // Tag breakdown. Untagged items get a best-guess tag from their name so
        // the chart is not dominated by an "untagged" slice.
        const tagExp: Record<string, number> = {};
        let guessedCount = 0;
        data.forEach((d) => d.transactions.filter((t) => t.type === "expense").forEach((t) => {
          let tags = ((t as any).tags || "").split(",").map((x: string) => x.trim()).filter(Boolean);
          if (tags.length === 0) { const g = guessTag(t.name || ""); if (g) guessedCount++; tags = [g || "untagged"]; }
          tags.forEach((k: string) => { tagExp[k] = (tagExp[k] || 0) + Math.abs(t.amount); });
        }));
        const tagSorted = Object.entries(tagExp).sort((a, b) => b[1] - a[1]);
        const tagTotal = tagSorted.reduce((s, [, v]) => s + v, 0) || 1;

        // Annotated items
        const annotated = data.flatMap((d) => d.transactions.filter((t) => (t as any).note).map((t) => ({ ...t, date: d.date })));

        // Risks
        const risks: string[] = [];
        if (negDays.length > 0) risks.push(`Balance goes negative on ${negDays.length} day${negDays.length > 1 ? "s" : ""} — lowest: ${fmt(minB)} on ${friendlyDate(lowDay.date)}`);
        if (negDays.length > 5) risks.push(`Extended negative stretch — consider moving large expenses or increasing income`);
        if (totalOut > totalIn) risks.push(`Expenses (${fmt(totalOut)}) exceed income (${fmt(totalIn)}) by ${fmt(totalOut - totalIn)}`);
        const bigNonRecur = data.flatMap((d) => d.transactions.filter((t) => t.type === "expense" && t.recurrence === "none" && t.amount >= 300));
        if (bigNonRecur.length) risks.push(`${bigNonRecur.length} large one-time expense${bigNonRecur.length > 1 ? "s" : ""} this month (${bigNonRecur.map((t) => t.name).join(", ")})`);

        // Chart data
        const range = maxB - minB || 1;
        const cw = 600, ch = 100, cpad = 40;
        const zeroY = 4 + ((maxB - 0) / range) * (ch - 8);

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, animation: "panelIn 0.2s ease" }}
            onClick={() => setShowDashboard(false)}>
            <div style={{ background: "#fff", borderRadius: 20, width: 720, maxWidth: "95vw", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }}
              onClick={(e) => e.stopPropagation()}>
              {/* Dashboard Header */}
              <div style={{ background: th.headerBg, padding: "24px 28px", borderRadius: "20px 20px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: th.headerText, opacity: 0.7 }}>Monthly Dashboard</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em" }}>{MONTHS[cM]} {cY}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={async () => {
                    // Build verbose markdown dashboard
                    const mk = `${cY}-${String(cM + 1).padStart(2, "0")}`;
                    const monthNote = (state.monthNotes || {})[mk] || "";
                    const negDaysLocal = data.filter((d) => d.balance < 0);
                    const avgBalLocal = balances.length ? balances.reduce((a: number, b: number) => a + b, 0) / balances.length : 0;
                    const lines = [
                      `# 📊 flowycash — ${MONTHS[cM]} ${cY}`,
                      ``,
                      `## Summary`,
                      `| Metric | Value |`,
                      `|--------|-------|`,
                      `| 💰 Income | ${fmt(totalIn)} |`,
                      `| 💸 Expenses | ${fmt(totalOut)} |`,
                      `| 📊 Net | ${fmt(totalIn - totalOut)} |`,
                      `| 📈 Avg Balance | ${fmt(avgBalLocal)} |`,
                      `| 📉 Low Point | ${fmt(minBal)} (${friendlyDate(lowDay.date)}) |`,
                      `| 🏁 End of Month | ${fmt(endBal)} |`,
                      `| ✅ Positive Days | ${data.filter((d) => d.balance >= 0).length} |`,
                      `| ❌ Negative Days | ${negDaysLocal.length} |`,
                      ``,
                    ];
                    if (monthNote) lines.push(`## 📝 Month Notes`, monthNote, ``);
                    if (negDaysLocal.length) {
                      lines.push(`## ⚠️ Negative Days`);
                      negDaysLocal.forEach((d) => lines.push(`- **${friendlyDate(d.date)}**: ${fmt(d.balance)}`));
                      lines.push(``);
                    }
                    // Top expenses
                    const expMapLocal: Record<string, number> = {};
                    data.forEach((d) => d.transactions.filter((t) => t.type === "expense").forEach((t) => { expMapLocal[t.name] = (expMapLocal[t.name] || 0) + Math.abs(t.amount); }));
                    const topExpLocal = Object.entries(expMapLocal).sort((a, b) => b[1] - a[1]).slice(0, 10);
                    lines.push(`## 💸 Top Expenses`);
                    lines.push(`| Item | Total |`);
                    lines.push(`|------|-------|`);
                    topExpLocal.forEach(([n, v]) => lines.push(`| ${n} | ${fmt(v)} |`));
                    lines.push(``);
                    // Tag breakdown
                    const tagExpLocal: Record<string, number> = {};
                    data.forEach((d) => d.transactions.filter((t) => t.type === "expense").forEach((t) => {
                      ((t as any).tags || "untagged").split(",").forEach((tag: string) => {
                        const k = tag.trim() || "untagged";
                        tagExpLocal[k] = (tagExpLocal[k] || 0) + Math.abs(t.amount);
                      });
                    }));
                    const tagSortedLocal = Object.entries(tagExpLocal).sort((a, b) => b[1] - a[1]);
                    const tagTotalLocal = tagSortedLocal.reduce((s, [, v]) => s + v, 0) || 1;
                    lines.push(`## 🏷️ Spending by Category`);
                    lines.push(`| Category | Amount | % |`);
                    lines.push(`|----------|--------|---|`);
                    tagSortedLocal.forEach(([tag, total]) => lines.push(`| ${tag} | ${fmt(total)} | ${((total / tagTotalLocal) * 100).toFixed(0)}% |`));
                    lines.push(``);
                    // Annotated items
                    const annotatedLocal = data.flatMap((d) => d.transactions.filter((t) => (t as any).note).map((t) => ({ ...t, date: d.date })));
                    if (annotatedLocal.length) {
                      lines.push(`## 📝 Notes on Items`);
                      annotatedLocal.forEach((t) => lines.push(`- **${t.name}** (${(t as any).date?.slice(5)}): ${(t as any).note}`));
                      lines.push(``);
                    }
                    lines.push(`---`, `*Generated by [flowycash.com](https://flowycash.com)*`);
                    const md = lines.join("\n");
                    // Build rich HTML for email paste
                    const html = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto">
                      <h1 style="color:${th.headerBg};margin:0 0 4px">📊 flowycash — ${MONTHS[cM]} ${cY}</h1>
                      <table style="border-collapse:collapse;width:100%;margin:12px 0"><tbody>
                      ${[["Income", fmt(totalIn), "#059669"], ["Expenses", fmt(totalOut), "#dc2626"], ["Net", fmt(totalIn - totalOut), totalIn >= totalOut ? "#059669" : "#dc2626"], ["Low", fmt(minBal), minBal < 0 ? "#dc2626" : "#666"], ["End", fmt(endBal), endBal < 0 ? "#dc2626" : "#059669"]]
                        .map(([l, v, c]) => `<tr><td style="padding:6px 12px;border:1px solid #eee;font-weight:600;color:#666">${l}</td><td style="padding:6px 12px;border:1px solid #eee;font-weight:800;color:${c};text-align:right">${v}</td></tr>`).join("")}
                      </tbody></table>
                      ${monthNote ? `<div style="background:#f0fdf4;padding:10px 14px;border-radius:8px;margin:12px 0;border-left:3px solid ${th.accent}"><b>📝 Note:</b> ${monthNote}</div>` : ""}
                      ${negDaysLocal.length ? `<div style="background:#fff5f5;padding:10px 14px;border-radius:8px;margin:12px 0;border-left:3px solid #ef4444"><b>⚠️ ${negDaysLocal.length} negative day${negDaysLocal.length > 1 ? "s" : ""}:</b> ${negDaysLocal.map((d) => `${friendlyDate(d.date)} (${fmt(d.balance)})`).join(", ")}</div>` : ""}
                      <h3 style="margin:16px 0 8px">💸 Top Expenses</h3>
                      <table style="border-collapse:collapse;width:100%"><tbody>
                      ${topExpLocal.map(([n, v]) => `<tr><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${n}</td><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#dc2626">${fmt(v)}</td></tr>`).join("")}
                      </tbody></table>
                      <h3 style="margin:16px 0 8px">🏷️ By Category</h3>
                      <table style="border-collapse:collapse;width:100%"><tbody>
                      ${tagSortedLocal.map(([tag, total]) => `<tr><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${tag}</td><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;text-align:right">${fmt(total)}</td><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#94a3b8">${((total / tagTotalLocal) * 100).toFixed(0)}%</td></tr>`).join("")}
                      </tbody></table>
                      <p style="margin-top:16px;color:#94a3b8;font-size:12px">— <a href="https://flowycash.com">flowycash.com</a></p>
                    </div>`;
                    try {
                      await navigator.clipboard.write([
                        new ClipboardItem({
                          "text/html": new Blob([html], { type: "text/html" }),
                          "text/plain": new Blob([md], { type: "text/plain" }),
                        }),
                      ]);
                      setShareMsg("Rich dashboard copied! Paste in email for formatted view.");
                    } catch {
                      try { await navigator.clipboard.writeText(md); setShareMsg("Markdown copied to clipboard!"); }
                      catch { const subject = encodeURIComponent(`flowycash — ${MONTHS[cM]} ${cY}`); window.open(`mailto:?subject=${subject}&body=${encodeURIComponent(md)}`); setShareMsg("Opening email..."); }
                    }
                    setTimeout(() => setShareMsg(""), 3000);
                  }} className="bf-btn" title="Share dashboard"
                    style={{ border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  </button>
                  <button onClick={() => setShowDashboard(false)} className="bf-btn" style={{ border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 18, width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>
              </div>

              <div style={{ padding: "20px 28px 28px" }}>
                {/* Month Note */}
                {(() => {
                  const mk = `${cY}-${String(cM + 1).padStart(2, "0")}`;
                  const note = (state.monthNotes || {})[mk];
                  return note ? (
                    <div onClick={() => { setShowDashboard(false); setMonthNoteText(note); setShowMonthNote(true); }}
                      style={{ background: "#f0fdf4", border: `1px solid ${th.accent}40`, borderRadius: 12, padding: "14px 16px", marginBottom: 20, cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={th.headerBg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{note}</div>
                    </div>
                  ) : (
                    <div onClick={() => { setShowDashboard(false); setMonthNoteText(""); setShowMonthNote(true); }}
                      style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 12, padding: "12px 16px", marginBottom: 20, cursor: "pointer", fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
                      + Add a note for {MONTHS[cM]}
                    </div>
                  );
                })()}

                {/* Key Metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                  {[
                    { label: "Income", value: fmt(totalIn), color: C.greenDark, bg: C.greenBg },
                    { label: "Expenses", value: fmt(totalOut), color: C.redDark, bg: C.redBg },
                    { label: "Net", value: fmt(totalIn - totalOut), color: totalIn >= totalOut ? C.greenDark : C.redDark, bg: totalIn >= totalOut ? C.greenBg : C.redBg },
                    { label: "Avg Balance", value: fmt(avgBal), color: avgBal >= 0 ? C.greenDark : C.redDark, bg: avgBal >= 0 ? C.greenBg : C.redBg },
                  ].map((m, i) => (
                    <div key={i} style={{ padding: "14px 16px", borderRadius: 12, background: m.bg }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: m.color, fontVariantNumeric: "tabular-nums" }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Forecast chart (was the separate Cashflow Chart modal) */}
                {(() => {
                  const { daysN, totalChartDays, maxB, minB, negDaysN, lowDayN, cw, ch, padL, padT, padB, chartW, zeroY, monthBounds, pts90, line90, area90 } = buildForecast(chartMonths);
                  return (
                    <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>Forecast from today</div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[1, 2, 3, 6].map((m) => (
                            <button key={m} onClick={() => setChartMonths(m)} className="bf-btn"
                              style={{ padding: "3px 10px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, background: chartMonths === m ? th.headerBg : "#e2e8f0", color: chartMonths === m ? "#fff" : "#64748b" }}>
                              {m}mo
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Chart */}
                      <svg viewBox={`0 0 ${cw} ${ch}`} style={{ width: "100%", height: "auto" }}>
                        <defs>
                          <clipPath id="c90above"><rect x={padL} y={0} width={chartW} height={zeroY} /></clipPath>
                          <clipPath id="c90below"><rect x={padL} y={zeroY} width={chartW} height={ch - zeroY} /></clipPath>
                        </defs>
                        <line x1={padL} y1={zeroY} x2={cw} y2={zeroY} stroke="#94a3b8" strokeWidth="0.5" />
                        <text x={padL - 4} y={padT + 4} textAnchor="end" fill="#94a3b8" fontSize="8">{fmtShort(maxB)}</text>
                        <text x={padL - 4} y={zeroY + 3} textAnchor="end" fill="#94a3b8" fontSize="8">$0</text>
                        {minB < 0 && <text x={padL - 4} y={ch - padB} textAnchor="end" fill="#ef4444" fontSize="8">{fmtShort(minB)}</text>}
                        {/* Month dividers */}
                        {monthBounds.slice(1).map((mb, i) => {
                          const x = padL + (mb.startIdx / (daysN.length - 1)) * chartW;
                          return <g key={i}><line x1={x} y1={padT} x2={x} y2={ch - padB} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" /><text x={x + 4} y={ch - 10} fill="#64748b" fontSize="9" fontWeight="600">{mb.month}</text></g>;
                        })}
                        <text x={padL + 4} y={ch - 10} fill="#64748b" fontSize="9" fontWeight="600">{monthBounds[0]?.month}</text>
                        <polygon points={area90} fill="rgba(16,185,129,0.1)" clipPath="url(#c90above)" />
                        <polygon points={area90} fill="rgba(239,68,68,0.12)" clipPath="url(#c90below)" />
                        <polyline points={line90} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" clipPath="url(#c90above)" />
                        <polyline points={line90} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round" clipPath="url(#c90below)" />
                        {pts90.filter((p) => p.bal < 0).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2" fill="#ef4444" />)}
                        <line x1={padL} y1={padT} x2={padL} y2={ch - padB} stroke="#cbd5e1" strokeWidth="1" />
                        <line x1={padL} y1={ch - padB} x2={cw} y2={ch - padB} stroke="#cbd5e1" strokeWidth="1" />
                      </svg>
                      {/* Stats */}
                      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                        <div style={{ flex: 1, padding: "12px", borderRadius: 10, background: "#f8fafc", textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Today</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: daysN[0]?.bal < 0 ? C.redDark : C.greenDark }}>{fmt(daysN[0]?.bal || 0)}</div>
                        </div>
                        <div style={{ flex: 1, padding: "12px", borderRadius: 10, background: "#f8fafc", textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Lowest</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: lowDayN.bal < 0 ? C.redDark : "#64748b" }}>{fmt(lowDayN.bal)}</div>
                          <div style={{ fontSize: 10, color: "#94a3b8" }}>{lowDayN.monthName} {lowDayN.day}</div>
                        </div>
                        <div style={{ flex: 1, padding: "12px", borderRadius: 10, background: "#f8fafc", textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Day {totalChartDays}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: daysN[totalChartDays - 1]?.bal < 0 ? C.redDark : C.greenDark }}>{fmt(daysN[totalChartDays - 1]?.bal || 0)}</div>
                        </div>
                        <div style={{ flex: 1, padding: "12px", borderRadius: 10, background: negDaysN.length ? "#fff5f5" : "#f0fdf4", textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Negative Days</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: negDaysN.length ? C.redDark : C.greenDark }}>{negDaysN.length}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Two columns: Top Expenses + Tag Breakdown */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                  {/* Top Expenses */}
                  <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: 10 }}>Top Expenses</div>
                    {topExp.map(([name, total], i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, borderBottom: "1px solid #f1f5f9" }}>
                        <span style={{ color: "#1e293b" }}>{name}</span>
                        <span style={{ fontWeight: 700, color: C.redDark, fontVariantNumeric: "tabular-nums" }}>{fmt(total)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Tag Pie Chart */}
                  <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: 10 }}>Spending by Category{guessedCount > 0 ? <span style={{ textTransform: "none", fontWeight: 500, letterSpacing: 0 }}> · {guessedCount} untagged item{guessedCount === 1 ? "" : "s"} guessed from name</span> : null}</div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <svg viewBox="0 0 140 140" style={{ width: 120, height: 120, flexShrink: 0 }}>
                        {(() => {
                          let angle = 0;
                          return tagSorted.map(([tag, total]) => {
                            const pct = total / tagTotal;
                            const startAngle = angle;
                            angle += pct * 360;
                            const endAngle = angle;
                            const sR = (startAngle - 90) * Math.PI / 180;
                            const eR = (endAngle - 90) * Math.PI / 180;
                            const la = pct > 0.5 ? 1 : 0;
                            const cx = 70, cy = 70, r = 65;
                            const x1 = cx + r * Math.cos(sR), y1 = cy + r * Math.sin(sR);
                            const x2 = cx + r * Math.cos(eR), y2 = cy + r * Math.sin(eR);
                            return <path key={tag} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${la} 1 ${x2},${y2} Z`} fill={tagColor(tag).text} opacity={0.8} />;
                          });
                        })()}
                      </svg>
                      <div style={{ flex: 1, maxHeight: 200, overflowY: "auto" }}>
                        {tagSorted.map(([tag, total]) => {
                          const tc = tagColor(tag);
                          const pct = ((total / tagTotal) * 100).toFixed(0);
                          return (
                            <div key={tag} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 11 }}>
                              <div style={{ width: 8, height: 8, borderRadius: 2, background: tc.text, flexShrink: 0 }} />
                              <span style={{ color: "#1e293b", flex: 1, display: "flex", alignItems: "center", gap: 3 }}><TagIconSvg tag={tag} size={9} />{tag}</span>
                              <span style={{ fontWeight: 700, color: C.redDark, fontVariantNumeric: "tabular-nums" }}>{fmt(total)}</span>
                              <span style={{ color: "#94a3b8", fontSize: 9, width: 26, textAlign: "right" }}>{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Risks */}
                {risks.length > 0 && (
                  <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.redDark, textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      Risks & Warnings
                    </div>
                    {risks.map((r, i) => (
                      <div key={i} style={{ fontSize: 13, color: "#991b1b", padding: "4px 0", lineHeight: 1.5 }}>• {r}</div>
                    ))}
                  </div>
                )}

                {/* Negative Days */}
                {negDays.length > 0 && (
                  <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#92400e", textTransform: "uppercase", marginBottom: 8 }}>
                      😢 Negative Days ({negDays.length})
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {negDays.map((d) => (
                        <div key={d.date} onClick={() => { setShowDashboard(false); setZoomDay(d.date); }}
                          style={{ padding: "4px 10px", borderRadius: 8, background: "#fff", border: "1px solid #fde68a", fontSize: 12, cursor: "pointer", display: "flex", gap: 6 }}>
                          <span style={{ color: "#64748b" }}>{d.day}</span>
                          <span style={{ fontWeight: 700, color: C.redDark }}>{fmt(d.balance)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Low Cashflow Weeks */}
                {(() => {
                  const weekData: { weekNum: number; startDay: number; endDay: number; minBal: number; avgBal: number; totalExp: number; negCount: number }[] = [];
                  weeks.forEach((wk, wi) => {
                    const days = wk.filter(Boolean) as number[];
                    if (!days.length) return;
                    const weekDays = days.map((d) => dayMap[dkey(cY, cM, d)]).filter(Boolean);
                    if (!weekDays.length) return;
                    const bals = weekDays.map((d) => d.balance);
                    const wMin = Math.min(...bals);
                    const wAvg = bals.reduce((a, b) => a + b, 0) / bals.length;
                    const wExp = weekDays.reduce((s, d) => s + d.transactions.filter((t) => t.type === "expense").reduce((a, t) => a + Math.abs(t.amount), 0), 0);
                    const wNeg = weekDays.filter((d) => d.balance < 0).length;
                    weekData.push({ weekNum: wi + 1, startDay: days[0], endDay: days[days.length - 1], minBal: wMin, avgBal: wAvg, totalExp: wExp, negCount: wNeg });
                  });
                  const watchWeeks = weekData.filter((w) => w.minBal < 500 || w.negCount > 0).sort((a, b) => a.minBal - b.minBal);
                  if (!watchWeeks.length) return null;
                  return (
                    <div style={{ background: "#fef7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#9a3412", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Low Cashflow Weeks to Watch
                      </div>
                      {watchWeeks.map((w) => (
                        <div key={w.weekNum} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #fde6c4" }}>
                          <div style={{ background: w.negCount > 0 ? "#fee2e2" : "#fff7ed", borderRadius: 8, padding: "6px 10px", minWidth: 60, textAlign: "center" }}>
                            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>WEEK {w.weekNum}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{w.startDay}–{w.endDay}</div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                              <span>Low: <strong style={{ color: w.minBal < 0 ? C.redDark : "#92400e" }}>{fmt(w.minBal)}</strong></span>
                              <span>Avg: <strong style={{ color: "#64748b" }}>{fmt(Math.round(w.avgBal))}</strong></span>
                              <span>Spend: <strong style={{ color: C.redDark }}>{fmt(w.totalExp)}</strong></span>
                            </div>
                            {w.negCount > 0 && <div style={{ fontSize: 11, color: C.redDark, marginTop: 2 }}>⚠️ {w.negCount} negative day{w.negCount > 1 ? "s" : ""}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Notes */}
                {annotated.length > 0 && (
                  <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      Annotated Items
                    </div>
                    {annotated.map((t, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}>
                        <span style={{ color: "#94a3b8", flexShrink: 0 }}>{(t as any).date?.slice(5)}</span>
                        <span style={{ fontWeight: 600, color: "#1e293b" }}>{t.name}</span>
                        <span style={{ color: "#64748b", fontStyle: "italic", flex: 1 }}>{(t as any).note}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary Footer */}
                <div style={{ marginTop: 20, padding: "14px 0 0", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}>
                  <span>{data.length} days · {data.reduce((s, d) => s + d.transactions.length, 0)} transactions</span>
                  <span>{posDays.length} positive · {negDays.length} negative</span>
                </div>
              </div>
            </div>
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
                      {(tx as any).note && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, fontStyle: "italic" }}>{(tx as any).note}</div>}
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
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}>
                <div onClick={async () => {
                    const next = !form.reminder;
                    setForm({ ...form, reminder: next });
                    if (next && !demo) {
                      const status = await ensurePushSubscription(true);
                      if (status === "denied") alert("Notifications are blocked for flowycash.com. Enable them in your browser or device settings to receive reminders.");
                      else if (status === "unsupported") alert("This browser doesn't support notifications. On iPhone, add FlowyCash to your Home Screen first (Share > Add to Home Screen), then enable the reminder from there.");
                    }
                  }}
                  style={{ width: 36, height: 20, borderRadius: 10, background: form.reminder ? C.blueDark : "#d1d5db", position: "relative", transition: "background 0.15s", cursor: "pointer" }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: form.reminder ? 18 : 2, transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                </div>
                <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                  Remind me at 9am day of
                  <svg width="11" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                </span>
              </label>
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
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Note</label>
                <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Add a note..." className="bf-input"
                  style={{ fontSize: 13, padding: "8px 12px", minHeight: 36, maxHeight: 80, resize: "vertical" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Tags</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", minHeight: 44, alignItems: "center" }}>
                  {form.tags.split(",").filter((s) => s.trim()).map((tag, i) => (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: tagColor(tag.trim()).bg, color: tagColor(tag.trim()).text, fontSize: 12, fontWeight: 600 }}>
                      <TagIconSvg tag={tag.trim()} size={11} />
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

      {/* Snap Preview - "What I'm About to Do" */}
      {snapPreview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, animation: "panelIn 0.18s ease" }}
          onClick={() => setSnapPreview(null)}>
          <div style={{ background: "#fff", borderRadius: 20, width: 520, maxWidth: "95vw", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }}
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ background: th.headerBg, padding: "20px 24px", borderRadius: "20px 20px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: th.headerText, opacity: 0.7 }}>Bank Reconciliation</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>What I&apos;m About to Do</div>
              </div>
              <button onClick={() => setSnapPreview(null)} className="bf-btn" style={{ border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 18, width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Screenshot thumbnail */}
              <div style={{ display: "flex", gap: 16, marginBottom: 20, padding: "14px", background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                {snapPreview.imageUrl ? (
                  <img src={snapPreview.imageUrl} alt="Bank screenshot" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={th.headerBg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>Detected bank balance</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: th.headerBg, fontVariantNumeric: "tabular-nums" }}>{fmt(snapPreview.balance)}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>as of {friendlyDate(snapPreview.date)}</div>
                </div>
              </div>

              {/* Action 1: Set balance reset */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: th.headerBg, color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>1</div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Set balance to {fmt(snapPreview.balance)}</span>
                </div>
                <div style={{ marginLeft: 32, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                  Create a balance reset on {friendlyDate(snapPreview.date)} to snap your forecast to the actual bank balance.
                </div>
              </div>

              {/* Action 2: Move already-cleared upcoming items */}
              {snapPreview.moved.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#f59e0b", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>2</div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{snapPreview.moved.length} upcoming item{snapPreview.moved.length > 1 ? "s" : ""} already cleared</span>
                  </div>
                  <div style={{ marginLeft: 32, fontSize: 13, color: "#64748b", lineHeight: 1.5, marginBottom: 6 }}>
                    Scheduled ahead but already posted — moved to the date each one actually cleared, so nothing is counted twice. Nothing is deleted.
                  </div>
                  <div style={{ marginLeft: 32 }}>
                    {snapPreview.moved.map((m, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13, borderBottom: "1px solid #f1f5f9" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        <span style={{ color: "#1e293b", fontWeight: 600 }}>{m.name}</span>
                        <span style={{ color: "#94a3b8" }}>{fmt(m.amount)}</span>
                        <span style={{ color: "#94a3b8", fontSize: 11 }}>{friendlyDate(m.from)} → {friendlyDate(m.to)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action 3: Informational — also on your statement (no action taken) */}
              {snapPreview.unaccounted.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#94a3b8", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>i</div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Also on your statement ({snapPreview.unaccounted.length})</span>
                  </div>
                  <div style={{ marginLeft: 32, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", padding: "10px 12px" }}>
                    {snapPreview.unaccounted.map((u, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#94a3b8", fontSize: 11, flexShrink: 0 }}>{friendlyDate(u.date)}</span>
                          <span style={{ color: "#334155", fontWeight: 600 }}>{u.name}</span>
                        </div>
                        <span style={{ fontWeight: 700, color: u.type === "income" ? C.greenDark : C.redDark }}>{u.type === "income" ? "+" : "-"}{fmt(u.amount)}</span>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>These already affected your current balance. Shown for reference — no changes made to your forecast.</div>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={async () => {
                  const p = snapPreview;
                  // 1. Snap the balance (the headline).
                  await callApi("/api/balance-resets", { method: "POST", body: JSON.stringify({ date: p.date, amount: p.balance }) });
                  // 2. Move each already-cleared future occurrence onto the date it
                  //    actually posted — a reversible override, never a delete. The
                  //    "also on your statement" list is informational and untouched.
                  for (const m of p.moved) {
                    if (m.txId && m.occurrenceDate) {
                      await callApi("/api/overrides", { method: "POST", body: JSON.stringify({ transactionId: m.txId, occurrenceDate: m.occurrenceDate, movedTo: m.to }) });
                    }
                  }
                  setSnapPreview(null);
                  await reload();
                  setShareMsg(p.moved.length ? `Balance synced · ${p.moved.length} cleared item${p.moved.length > 1 ? "s" : ""} moved` : "Balance synced from your statement");
                  setTimeout(() => setShareMsg(""), 3000);
                }} className="bf-btn" style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: th.headerBg, color: "#fff", fontSize: 15, fontWeight: 700 }}>
                  Apply
                </button>
                <button onClick={() => setSnapPreview(null)} className="bf-btn" style={{ padding: "14px 24px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600 }}>
                  Cancel
                </button>
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
              Snap your forecast to reality — set the actual balance for <strong>{friendlyDate(resetDt)}</strong>, or add bank screenshots and/or a CSV below and let us reconcile.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>Actual balance</label>
              <input autoFocus type="number" step="0.01" value={resetAmt} onChange={(e) => setResetAmt(e.target.value)} placeholder="0.00" className="bf-input" style={{ fontSize: 18, padding: "14px 16px" }} />
            </div>
            <button onClick={handleResetSave} className="bf-btn" style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: C.blueDark, color: "#fff", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Apply reset</button>
            <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <label className="bf-btn" style={{ flex: 1, padding: "12px", borderRadius: 12, border: `1.5px solid ${th.accent}`, background: th.totalBg, color: th.headerBg, fontSize: 13, fontWeight: 600, cursor: snapLoading ? "wait" : "pointer", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: snapLoading ? 0.6 : 1 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Snap from Photo
                <input type="file" accept="image/*" multiple hidden disabled={snapLoading} onChange={async (e) => {
                  const files = e.target.files;
                  if (files && files.length) await onSnapImages(files);
                  e.target.value = "";
                }} />
              </label>
              <label className="bf-btn" style={{ flex: 1, padding: "12px", borderRadius: 12, border: `1.5px solid ${th.accent}`, background: th.totalBg, color: th.headerBg, fontSize: 13, fontWeight: 600, cursor: snapLoading ? "wait" : "pointer", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: snapLoading ? 0.6 : 1 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
                Import CSV
                <input type="file" accept=".csv" hidden disabled={snapLoading} onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await onSnapCsv(file);
                  e.target.value = "";
                }} />
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 8, fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span>Screenshots and CSVs are sent to be read by AI (Anthropic Claude) to extract your balance and transactions. The app doesn&apos;t save the uploaded file itself.</span>
            </div>
            {snapLoading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, fontSize: 13, color: "#64748b" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Reading your statement…
              </div>
            )}
            {snapBank && !snapLoading && (() => {
              const nAcc = snapBank.accounts?.length || 0;
              const nTx = snapBank.transactions?.length || 0;
              const parts = [nAcc ? `${nAcc} account${nAcc === 1 ? "" : "s"}` : "", nTx ? `${nTx} transaction${nTx === 1 ? "" : "s"}` : ""].filter(Boolean);
              return (
                <div style={{ marginTop: 10, padding: "10px 12px", background: th.totalBg, border: `1px solid ${th.accent}55`, borderRadius: 10 }}>
                  <div style={{ fontSize: 12.5, color: th.headerBg, fontWeight: 600, marginBottom: 8 }}>
                    Detected {parts.length ? parts.join(" + ") : "nothing yet"}. Add more sources or review.
                  </div>
                  <button onClick={reviewSnap} disabled={!nAcc && !nTx} className="bf-btn"
                    style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: nAcc || nTx ? th.headerBg : "#cbd5e1", color: "#fff", fontSize: 14, fontWeight: 700 }}>
                    Review reconciliation →
                  </button>
                </div>
              );
            })()}
            {Object.keys(state.balanceResets || {}).length > 0 && (() => {
              const entries = Object.entries(state.balanceResets).sort((a, b) => b[0].localeCompare(a[0]));
              const shown = showAllResets ? entries : entries.slice(0, 4);
              return (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Active resets ({entries.length})</div>
                    {entries.length > 4 && (
                      <button onClick={() => setShowAllResets((v) => !v)} className="bf-btn" style={{ border: "none", background: "none", color: C.blueDark, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        {showAllResets ? "Show fewer" : `Show all ${entries.length}`}
                      </button>
                    )}
                  </div>
                  {shown.map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", fontSize: 13, borderBottom: "1px solid #f1f5f9" }}>
                      <span><span style={{ color: "#64748b" }}>{friendlyDate(k)}</span> — <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</span></span>
                      <button onClick={() => deleteReset(k)} className="bf-btn" style={{ border: "none", background: "none", color: C.redDark, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Remove</button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Debt Distribution Wizard */}
      {panel === "debt-distribution" && (() => {
        const debtTotal = Math.round(debtChunks.reduce((s, c) => s + (c.amount || 0), 0) * 100) / 100;
        const debtMin = simulateDistribution(data, debtChunks);
        const unsafe = debtMin < 0;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, animation: "panelIn 0.18s ease" }}
            onClick={(e) => { if (e.target === e.currentTarget) setPanel(null); }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: "28px 28px 24px", width: 460, maxWidth: "92vw", maxHeight: "88vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: th.headerBg, display: "flex" }}><TagIconSvg tag="debt" size={18} /></span>
                  Distribute a Debt
                </span>
                <button onClick={() => setPanel(null)} className="bf-btn" style={{ border: "none", background: "none", fontSize: 22, color: "#94a3b8", cursor: "pointer", padding: "2px 6px" }}>×</button>
              </div>

              {debtStep === 0 && (
                <>
                  <p style={{ fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 1.5 }}>
                    Enter a lump-sum debt to repay. We&apos;ll spread it across upcoming paydays so no day in {MONTHS[cM]} dips below zero.
                  </p>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>Amount to distribute</label>
                    <input autoFocus type="number" step="0.01" value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} placeholder="0.00" className="bf-input" style={{ fontSize: 18, padding: "14px 16px" }}
                      onKeyDown={(e) => { if (e.key === "Enter") { const amt = parseFloat(debtAmount); if (amt > 0) { setDebtChunks(distributeDebt(amt, data)); setDebtStep(1); } } }} />
                  </div>
                  <button onClick={() => { const amt = parseFloat(debtAmount); if (amt > 0) { setDebtChunks(distributeDebt(amt, data)); setDebtStep(1); } }}
                    disabled={!(parseFloat(debtAmount) > 0)} className="bf-btn"
                    style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: parseFloat(debtAmount) > 0 ? th.headerBg : "#cbd5e1", color: "#fff", fontSize: 15, fontWeight: 600, cursor: parseFloat(debtAmount) > 0 ? "pointer" : "not-allowed" }}>
                    Propose a plan
                  </button>
                </>
              )}

              {debtStep === 1 && (
                <>
                  <p style={{ fontSize: 13, color: "#64748b", marginBottom: 14, lineHeight: 1.5 }}>
                    Adjust the dates or amounts, then confirm. Each chunk becomes a one-off <strong>debt</strong> expense.
                  </p>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>Label</label>
                    <input value={debtName} onChange={(e) => setDebtName(e.target.value)} className="bf-input" placeholder="Debt Repayment" />
                  </div>
                  {debtChunks.length === 0 && (
                    <div style={{ padding: "12px 14px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, fontSize: 13, color: "#9a3412", marginBottom: 14 }}>
                      No upcoming dates left this month to place a repayment. Move to a future month and try again.
                    </div>
                  )}
                  {debtChunks.map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <input type="date" value={c.date} onChange={(e) => setDebtChunks((prev) => prev.map((p, j) => j === i ? { ...p, date: e.target.value } : p))}
                        className="bf-input" style={{ flex: 1, padding: "10px 12px", fontSize: 13 }} />
                      <div style={{ position: "relative", width: 120 }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }}>$</span>
                        <input type="number" step="0.01" value={c.amount} onChange={(e) => setDebtChunks((prev) => prev.map((p, j) => j === i ? { ...p, amount: parseFloat(e.target.value) || 0 } : p))}
                          className="bf-input" style={{ padding: "10px 12px 10px 20px", fontSize: 13, fontVariantNumeric: "tabular-nums" }} />
                      </div>
                      <button onClick={() => setDebtChunks((prev) => prev.filter((_, j) => j !== i))} className="bf-btn" title="Remove"
                        style={{ border: "none", background: "none", color: "#94a3b8", fontSize: 18, cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9", fontSize: 14 }}>
                    <span style={{ color: "#64748b" }}>Total distributed</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#1e293b" }}>{fmt(debtTotal)}</span>
                  </div>
                  {unsafe && (
                    <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, fontSize: 12.5, color: "#991b1b", marginTop: 12, lineHeight: 1.4 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <span>This plan takes your lowest projected balance to <strong>{fmt(debtMin)}</strong>. Push some dates later, lower a chunk, or repay less to stay above zero.</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button onClick={() => setDebtStep(0)} className="bf-btn" style={{ padding: "12px 18px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600 }}>Back</button>
                    <button onClick={handleDebtConfirm} disabled={debtChunks.filter((c) => c.amount > 0 && c.date).length === 0} className="bf-btn"
                      style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: debtChunks.some((c) => c.amount > 0 && c.date) ? th.headerBg : "#cbd5e1", color: "#fff", fontSize: 15, fontWeight: 700 }}>
                      Create {debtChunks.filter((c) => c.amount > 0 && c.date).length} transaction{debtChunks.filter((c) => c.amount > 0 && c.date).length === 1 ? "" : "s"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8, flex: 1, minHeight: 0, overflowY: "auto", alignContent: "start" }}>
              {DAY_NAMES.map((dn, i) => {
                const day = wk[i];
                const dd = day ? dayMap[dkey(cY, cM, day)] : null;
                const key = day ? dkey(cY, cM, day) : `empty-${i}`;
                const isToday = key === todayKey;
                const isPast = key < todayKey;
                if (!day) return <div key={key} style={{ background: "#f8fafc", borderRadius: 12, opacity: 0.3 }} />;
                return (
                  <div key={key} style={{ background: dd && dd.balance < 0 ? "#fff5f5" : th.calBg, border: `1px solid ${th.gridBorder}`, borderRadius: 12, display: "flex", flexDirection: "column", minHeight: 160, opacity: isPast ? 0.55 : 1 }}>
                    <div style={{ padding: "10px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${th.gridBorder}` }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>{dn}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: isToday ? th.accent : "#1e293b" }}>{day}</div>
                      </div>
                      {dd?.hasReset && <span style={{ fontSize: 9, fontWeight: 700, background: C.blueDark, color: "#fff", padding: "2px 6px", borderRadius: 4 }}>RST</span>}
                    </div>
                    <div style={{ flex: 1, padding: "6px 10px" }}>
                      {visibleTx(dd?.transactions || []).map((tx, ti) => (
                        <div key={ti} className="tx-chip" draggable onDragStart={(e) => onDragStart(e, tx, tx.occurrenceDate)}
                          onClick={(e) => { e.stopPropagation(); openEdit(tx, tx.occurrenceDate); }}
                          style={{ fontSize: 13, padding: "4px 8px", marginBottom: 4, borderRadius: 6,
                            background: (tx as any).highlight ? hlColor((tx as any).highlight).bg : "transparent",
                            borderLeft: (tx as any).highlight ? `3px solid ${hlColor((tx as any).highlight).border}` : "none",
                            display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 14, flexShrink: 0, fontSize: 13, color: tx.recurrence !== "none" ? "#64748b" : "transparent", lineHeight: 1, textAlign: "center" }}>{tx.recurrence !== "none" ? "↻" : ""}</span>
                          <span style={{ flex: "1 1 auto", minWidth: 36, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", color: th.itemText }}>{tx.name}</span>
                          {(tx as any).note && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
                          {(tx as any).autopay && <svg width="9" height="11" viewBox="0 0 8 10" style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.6 }}><path d="M4.5 0L0 6h3.5L3 10l5-6H4.5z" fill="#f59e0b"/></svg>}
                          <span style={{ marginLeft: (tx as any).autopay ? 2 : "auto", flexShrink: 0, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 12, color: tx.type === "income" ? C.greenDark : C.redDark }}>{fmt(Math.abs(tx.amount))}</span>
                        </div>
                      ))}
                      {visibleTx(dd?.transactions || []).length === 0 && <div style={{ color: "#cbd5e1", fontSize: 12, padding: "8px 0" }}>No transactions</div>}
                    </div>
                    <div onClick={(e) => { e.stopPropagation(); openResetPanel(key); }}
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
        <div data-tour="calendar" style={{ overflowX: "auto", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridTemplateRows: `45px repeat(${weeks.length}, minmax(${Math.max(72, fontSize * 7)}px, 1fr))`, borderRadius: 14, overflow: "hidden", border: `1px solid ${th.gridBorder}`, flex: "1 0 auto" }}>
            {DAYS.map((d, i) => (
              <div key={i} style={{ padding: "10px 4px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: th.dayBarText, textAlign: "center", background: th.dayBarBg, borderBottom: `1px solid ${th.dayBarBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{d}</div>
            ))}
            {/* Find last empty cell for logo placement */}
            {(() => {
              let lastEmptyKey = "";
              weeks.forEach((w, wIdx) => w.forEach((d, dIdx) => { if (!d) lastEmptyKey = `${wIdx}-${dIdx}`; }));
              return weeks.map((wk, wi) =>
                wk.map((day, di) => {
                  if (!day) {
                    const isLogoCell = `${wi}-${di}` === lastEmptyKey;
                    return (
                      <div key={`${wi}-${di}`} style={{ minHeight: 0, background: th.calBg, borderTop: `1px solid ${th.gridBorder}`, borderRight: di < 6 ? `1px solid ${th.gridBorder}` : "none", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
                        {isLogoCell && <img src="/logo.png" alt="" style={{ maxWidth: "min(60%, 110px)", maxHeight: "min(60%, 80px)", objectFit: "contain", opacity: 0.85 }} />}
                      </div>
                    );
                  }
                const key = dkey(cY, cM, day);
                const dd = dayMap[key];
                const isToday = key === todayKey;
                const isPast = key < todayKey;
                const isSel = selDay === key;
                return (
                  <div key={key} className="cal-cell"
                    style={{ minHeight: 0, position: "relative", cursor: "pointer",
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
                    <div style={{ flex: 1, minHeight: 0, padding: "6px 7px" }}
                      onClick={(e) => { if (e.target === e.currentTarget) openAdd(key); }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        {isToday ? (
                          <span onClick={(e) => { e.stopPropagation(); setZoomDay(key); }} className="day-num" style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: C.blueDark, width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{day}</span>
                        ) : (
                          <span onClick={(e) => { e.stopPropagation(); setZoomDay(key); }} className="day-num" style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", lineHeight: "18px", cursor: "pointer" }}>{day}</span>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
                          {di === 0 && <span onClick={(e) => { e.stopPropagation(); setZoomWeek(wi); }} className="cell-plus" title="Week view" style={{ cursor: "pointer", opacity: 0, display: "flex", alignItems: "center" }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>}
                          <span onClick={(e) => { e.stopPropagation(); setEditTx(null); setEditDate(null); setForm({ name: "", amount: "", type: "expense", recurrence: "none", date: key, autopay: false, reminder: false, tags: "", highlight: "", note: "" }); setTagInput(""); openPanel("tx"); }} className="cell-plus cell-addbtn" title="Add expense" style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13, fontWeight: 800, color: C.redDark, lineHeight: 1, opacity: 0, transition: "all 0.12s" }}>−</span>
                          <span onClick={(e) => { e.stopPropagation(); setEditTx(null); setEditDate(null); setForm({ name: "", amount: "", type: "income", recurrence: "none", date: key, autopay: false, reminder: false, tags: "", highlight: "", note: "" }); setTagInput(""); openPanel("tx"); }} className="cell-plus cell-addbtn" title="Add income" style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13, fontWeight: 800, color: C.greenDark, lineHeight: 1, opacity: 0, transition: "all 0.12s" }}>+</span>
                        </div>
                      </div>
                      {day === 1 && carryOver !== 0 && (
                        <div style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", marginBottom: 2, borderRadius: 4, background: th.totalBg, border: `1px solid ${th.totalBorder}`, color: carryOver < 0 ? C.redDark : C.greenDark, fontVariantNumeric: "tabular-nums", display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                          {fmt(carryOver)}
                        </div>
                      )}
                      <div>
                        {visibleTx(dd?.transactions || []).map((tx, i) => (
                          <div key={i} className="tx-chip" draggable onDragStart={(e) => onDragStart(e, tx, tx.occurrenceDate)}
                            onClick={(e) => { e.stopPropagation(); openEdit(tx, tx.occurrenceDate); }}
                            style={{ fontSize, fontWeight: 600, padding: "1px 6px", marginTop: 1, borderRadius: 5, lineHeight: 1.3,
                              background: (tx as any).highlight ? hlColor((tx as any).highlight).bg : "transparent",
                              borderLeft: (tx as any).highlight ? `3px solid ${hlColor((tx as any).highlight).border}` : "none",
                              color: th.itemText,
                              opacity: txMatchesFilter(tx) ? 1 : 0.15,
                              minWidth: 0, overflow: "hidden", display: "flex", alignItems: "flex-start", gap: 3 }}>
                            <span style={{ width: 14, flexShrink: 0, fontSize: 13, color: tx.recurrence !== "none" ? "#64748b" : "transparent", lineHeight: 1.3, textAlign: "center" }}>{tx.recurrence !== "none" ? "↻" : ""}</span>
                            <span style={{ flex: "1 1 auto", minWidth: 36, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{tx.name}</span>
                            {(tx as any).note && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
                            
                            {showTagPills && ((tx as any).tags || "").split(",").filter((s: string) => s.trim()).map((tag: string, ti: number) => (
                              <span key={ti} title={tag.trim()} style={{ color: tagColor(tag.trim()).text, flexShrink: 0, display: "inline-flex", alignItems: "center", marginTop: 2 }}><TagIconSvg tag={tag.trim()} size={fontSize - 2} /></span>
                            ))}
                            {(tx as any).autopay && <svg width="8" height="10" viewBox="0 0 8 10" style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.6 }}><path d="M4.5 0L0 6h3.5L3 10l5-6H4.5z" fill="#f59e0b"/></svg>}
                            <span style={{ marginLeft: (tx as any).autopay ? 2 : "auto", flexShrink: 0, fontVariantNumeric: "tabular-nums", fontSize, fontWeight: 600, color: tx.type === "income" ? C.greenDark : C.redDark }}>{fmtShort(Math.abs(tx.amount)).replace("$", "")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div onClick={(e) => { e.stopPropagation(); openResetPanel(key); }}
                      style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, padding: "4px 6px", background: th.totalBg, borderTop: `1px solid ${th.totalBorder}`, cursor: "pointer" }}
                      title="Click to set balance reset">
                      <div style={{ display: "flex", alignItems: "center", gap: 3, marginRight: "auto" }}>
                        {dd && (() => { const hasLoan = dd.transactions.some((t) => t.name.toLowerCase() === "beth loan"); const hasRepay = dd.transactions.some((t) => t.name.toLowerCase() === "beth repayment"); if (!hasLoan && !hasRepay) return null; return <>{hasLoan && <svg width="14" height="14" viewBox="0 0 24 24" fill={C.greenDark} stroke={C.greenDark} strokeWidth="1" style={{ flexShrink: 0 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}{hasRepay && <svg width="14" height="14" viewBox="0 0 24 24" fill={C.redDark} stroke={C.redDark} strokeWidth="1" style={{ flexShrink: 0 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}</>; })()}
                        {dd && dd.balance < 0 && <span onClick={(e) => { e.stopPropagation(); setAdviceDay(key); }} style={{ cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" }} title="Get advice"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span>}
                        {dd?.hasReset && <span style={{ fontSize: 7, fontWeight: 700, background: C.blueDark, color: "#fff", padding: "1px 4px", borderRadius: 3, letterSpacing: "0.04em" }}>RST</span>}
                      </div>
                      {dd && dd.balance < 0 && <span style={{ fontSize: 16 }}>😢</span>}
                      {dd && <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color: dd.balance < 0 ? C.redDark : C.greenDark }}>{fmtShort(dd.balance)}</span>}
                    </div>
                  </div>
                );
              })
              );
            })()}
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
          {(() => {
            const hiddenCount = data.filter((d) => d.date < todayKey).length;
            if (hiddenCount === 0) return null;
            return (
              <div onClick={() => setHidePastDays((v) => !v)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#64748b", userSelect: "none" }}>
                {hidePastDays ? `Show ${hiddenCount} past day${hiddenCount > 1 ? "s" : ""}` : `Hide past days`}
              </div>
            );
          })()}
          {data.filter((dd) => !hidePastDays || dd.date >= todayKey).map((dd) => {
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
                    {!isOpen && visibleTx(dd.transactions).length > 0 && <span style={{ fontSize: 11, color: "#94a3b8" }}>{visibleTx(dd.transactions).length} item{visibleTx(dd.transactions).length > 1 ? "s" : ""}</span>}
                    {visibleTx(dd.transactions).length === 0 && <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {dd.balance < 0 && <span onClick={(e) => { e.stopPropagation(); setAdviceDay(dd.date); }} style={{ cursor: "pointer", flexShrink: 0, display: "inline-flex", alignItems: "center" }} title="Get advice"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span>}
                    {dd.balance < 0 && <span style={{ fontSize: 14 }}>😢</span>}
                    <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color: dd.balance < 0 ? C.redDark : C.greenDark }}>{fmt(dd.balance)}</span>
                  </div>
                </div>
                {isOpen && (
                  <>
                    {visibleTx(dd.transactions).map((tx, i) => (
                      <div key={i} className="list-row" draggable onDragStart={(e) => onDragStart(e, tx, tx.occurrenceDate)}
                        onClick={() => openEdit(tx, tx.occurrenceDate)}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 18px 8px 36px", cursor: "pointer", borderRadius: 0,
                          opacity: txMatchesFilter(tx) ? 1 : 0.15,
                          background: touchDrag && touchDrag.tx.id === tx.id && touchDrag.od === tx.occurrenceDate ? "#dbeafe" : (tx as any).highlight ? hlColor((tx as any).highlight).bg : "transparent",
                          borderLeft: (tx as any).highlight ? `3px solid ${hlColor((tx as any).highlight).border}` : "none",
                          ...(touchDrag && touchDrag.tx.id === tx.id && touchDrag.od === tx.occurrenceDate ? { outline: "2px solid #3b82f6", outlineOffset: -2 } : {}),
                        }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: tx.type === "income" ? C.green : C.red, flexShrink: 0 }} />
                          <span style={{ width: 18, flexShrink: 0, fontSize: 15, color: tx.recurrence !== "none" ? "#64748b" : "transparent", lineHeight: 1, textAlign: "center" }}>{tx.recurrence !== "none" ? "↻" : ""}</span>
                          <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: th.itemText }}>{tx.name}</span>
                          {(tx as any).note && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
                          {showTagPills && ((tx as any).tags || "").split(",").filter((s: string) => s.trim()).map((tag: string, ti: number) => (
                            <span key={ti} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: tagColor(tag.trim()).bg, color: tagColor(tag.trim()).text, flexShrink: 0, whiteSpace: "nowrap", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}><TagIconSvg tag={tag.trim()} size={10} />{tag.trim()}</span>
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
      <div data-tour="footer" style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, background: "#f1f5f9", borderRadius: 8, padding: 2 }}>
          <button onClick={() => setFontSize((s) => Math.max(8, s - 1))} className="bf-btn" style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", fontSize: 13, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>−</button>
          <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, minWidth: 14, textAlign: "center" }}>A</span>
          <button onClick={() => setFontSize((s) => Math.min(18, s + 1))} className="bf-btn" style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", fontSize: 13, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>+</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setShowThemePicker(true)} className="bf-btn" title="Theme"
            style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #d1d5db", background: "#fff", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2v-1a2 2 0 0 1 2-2h2a4 4 0 0 0 4-4c0-6-4.5-11-10-11z"/><circle cx="7.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/><circle cx="16.5" cy="10.5" r="1.2" fill="currentColor"/></svg>
          </button>
          <button onClick={() => { setDebtAmount(""); setDebtChunks([]); setDebtName("Debt Repayment"); setDebtStep(0); openPanel("debt-distribution"); }} className="bf-btn footer-debt"
            style={{ border: "none", background: "none", padding: 0, color: "#64748b", fontSize: 11, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", whiteSpace: "nowrap" }}>
            Distribute a debt
          </button>
          <button onClick={async () => {
            setCalFeed({ open: true, url: "", webcal: "", error: "", copied: false });
            if (demo || !isSignedIn) { setCalFeed((c) => ({ ...c, error: "Sign in to get your personal calendar link." })); return; }
            try {
              const r = await fetch("/api/calendar");
              const d = await r.json();
              if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
              setCalFeed((c) => ({ ...c, url: d.url, webcal: d.webcal }));
            } catch (e) { setCalFeed((c) => ({ ...c, error: e instanceof Error ? e.message : String(e) })); }
          }} className="bf-btn footer-debt"
            style={{ border: "none", background: "none", padding: 0, color: "#64748b", fontSize: 11, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", whiteSpace: "nowrap" }}>
            Calendar feed
          </button>
          <button onClick={() => setShowPlaidDemo(true)} className="bf-btn"
            style={{ border: "none", background: "none", padding: 0, color: th.accent, fontSize: 11, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", whiteSpace: "nowrap" }}>
            Plaid demo
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <a href="/api/export" download className="bf-btn"
            style={{ padding: "4px 10px", borderRadius: 20, border: "1.5px solid #d1d5db", background: "#fff", color: "#64748b", fontSize: 10, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Backup
          </a>
          <label className="bf-btn"
            style={{ padding: "4px 10px", borderRadius: 20, border: "1.5px solid #d1d5db", background: "#fff", color: "#64748b", fontSize: 10, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Restore
            <input type="file" accept=".json" hidden onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              if (!confirm("This will replace ALL current data. Continue?")) return;
              await callApi("/api/import", { method: "POST", body: text });
              await reload();
              e.target.value = "";
            }} />
          </label>
          <button onClick={() => { setTutorialStep(0); }} className="bf-btn"
            style={{ padding: "4px 10px", borderRadius: 20, border: "1.5px solid #d1d5db", background: "#fff", color: "#64748b", fontSize: 10, fontWeight: 600 }}>
            ?
          </button>
          {!(isSignedIn && !isPro) && (
            <button onClick={() => { setDemo((d) => { const v = !d; localStorage.setItem("flowycash-demo", String(v)); if (v && !demoState) setDemoState(buildDemoData()); return v; }); }} className="bf-btn"
              style={{ padding: "4px 12px", borderRadius: 20, border: demo ? "1.5px solid #fbbf24" : "1.5px solid #d1d5db", background: demo ? "#fef3c7" : "#fff", color: demo ? "#92400e" : "#64748b", fontSize: 10, fontWeight: 600, letterSpacing: "0.02em" }}>
              Demo
            </button>
          )}
        </div>
      </div>

      {showPlaidDemo && <PlaidDemo onClose={() => setShowPlaidDemo(false)} />}

      {/* Calendar feed */}
      {calFeed.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, animation: "panelIn 0.15s ease" }}
          onClick={() => setCalFeed((c) => ({ ...c, open: false }))}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px 22px", width: 440, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>Calendar feed</span>
              <button onClick={() => setCalFeed((c) => ({ ...c, open: false }))} className="bf-btn" style={{ border: "none", background: "none", fontSize: 20, color: "#94a3b8", cursor: "pointer", padding: "0 4px" }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, margin: "0 0 12px" }}>
              Every payment with the <strong>Reminder</strong> toggle on shows up in your calendar with an alert at 9 AM on the day. Subscribe once; it updates itself.
            </p>
            {calFeed.error && <div style={{ fontSize: 13, color: C.redDark, marginBottom: 8 }}>{calFeed.error}</div>}
            {calFeed.webcal && (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <input readOnly value={calFeed.webcal} onFocus={(e) => e.currentTarget.select()} className="bf-input" style={{ fontSize: 12, padding: "8px 10px" }} />
                  <button onClick={async () => { try { await navigator.clipboard.writeText(calFeed.webcal); setCalFeed((c) => ({ ...c, copied: true })); } catch { /* ignore */ } }} className="bf-btn"
                    style={{ border: "none", borderRadius: 8, padding: "0 14px", background: th.accent, color: "#fff", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{calFeed.copied ? "Copied" : "Copy"}</button>
                </div>
                <a href={calFeed.webcal} className="bf-btn" style={{ display: "inline-block", marginBottom: 12, padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${th.accent}`, color: th.accent, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>Open in Calendar</a>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                  <div><strong>iPhone:</strong> tap Open in Calendar, or Settings → Calendar → Accounts → Add Subscribed Calendar and paste the link.</div>
                  <div><strong>Mac:</strong> Calendar → File → New Calendar Subscription, paste the link.</div>
                  <div><strong>Google Calendar:</strong> Other calendars → From URL, paste the link (use https instead of webcal).</div>
                </div>
              </>
            )}
            {!calFeed.webcal && !calFeed.error && <div style={{ fontSize: 13, color: "#94a3b8" }}>Loading…</div>}
          </div>
        </div>
      )}

      {/* Theme picker */}
      {showThemePicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, animation: "panelIn 0.15s ease" }}
          onClick={() => setShowThemePicker(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px 22px", width: 300, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>Theme</span>
              <button onClick={() => setShowThemePicker(false)} className="bf-btn" style={{ border: "none", background: "none", fontSize: 20, color: "#94a3b8", cursor: "pointer", padding: "0 4px" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(THEMES).map(([key, t]) => (
                <button key={key} onClick={() => { setTheme(key); localStorage.setItem("flowycash-theme", key); setShowThemePicker(false); }} className="bf-btn"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 10, border: theme === key ? `1.5px solid ${t.accent}` : "1.5px solid #e2e8f0", background: theme === key ? t.totalBg : "#fff", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: t.swatch, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", flex: 1 }}>{t.name}</span>
                  {theme === key && <span style={{ fontSize: 11, fontWeight: 700, color: t.accent }}>Current</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShare && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, animation: "panelIn 0.18s ease" }}
          onClick={() => setShowShare(false)}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "28px 28px 24px", width: 420, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={th.headerBg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                Share with Partner
              </span>
              <button onClick={() => setShowShare(false)} className="bf-btn" style={{ border: "none", background: "none", fontSize: 22, color: "#94a3b8", cursor: "pointer" }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20, lineHeight: 1.5 }}>
              Invite someone to see your cashflow calendar. They sign up with this email and automatically see your data.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="partner@email.com" className="bf-input" style={{ fontSize: 14, padding: "10px 14px", flex: 1 }}
                onKeyDown={(e) => { if (e.key === "Enter" && shareEmail.trim()) {
                  fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: shareEmail }) })
                    .then(() => { setSharedWith((prev) => [...prev, { email: shareEmail.toLowerCase().trim() }]); setShareEmail(""); });
                }}} />
              <button onClick={() => {
                if (!shareEmail.trim()) return;
                fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: shareEmail }) })
                  .then(() => { setSharedWith((prev) => [...prev, { email: shareEmail.toLowerCase().trim() }]); setShareEmail(""); });
              }} className="bf-btn" style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: th.headerBg, color: "#fff", fontSize: 13, fontWeight: 600 }}>
                Invite
              </button>
            </div>
            {sharedWith.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Shared with</div>
                {sharedWith.map((s) => (
                  <div key={s.email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      <span style={{ color: "#1e293b" }}>{s.email}</span>
                    </div>
                    <button onClick={() => {
                      fetch("/api/share", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: s.email }) })
                        .then(() => setSharedWith((prev) => prev.filter((x) => x.email !== s.email)));
                    }} className="bf-btn" style={{ border: "none", background: "none", color: C.redDark, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            {sharedWith.length === 0 && (
              <div style={{ textAlign: "center", padding: "16px 0", color: "#94a3b8", fontSize: 13 }}>No one yet — invite your partner above</div>
            )}
          </div>
        </div>
      )}

      {/* Tutorial */}
      {tutorialStep >= 0 && (() => {
        const steps: { title: string; text: string; icon: string; target: string; pos: "bottom" | "top"; enter?: () => void; exit?: () => void }[] = [
          { title: "Welcome to flowycash", text: "Your personal cashflow calendar. See every dollar in and out, day by day.", icon: "👋", target: "[data-tour='logo']", pos: "bottom" },
          { title: "Navigate Months", text: "Use ‹ › to switch months. Click the month name to add notes for that month.", icon: "📅", target: "[data-tour='month']", pos: "bottom" },
          { title: "Tags & Categories", text: "Toggle tags to see spending by category. Hover a tag pill for the breakdown.", icon: "🏷️", target: "[data-tour='tags']", pos: "bottom", enter: () => setShowTagPills(true), exit: () => setShowTagPills(false) },
          { title: "Dashboard", text: "Reports: forecast chart, metrics, risks, top expenses, and category breakdown.", icon: "📊", target: "[data-tour='dashboard']", pos: "bottom", enter: () => setShowDashboard(true), exit: () => setShowDashboard(false) },
          { title: "Click a Day", text: "Click any day number for a detailed view. Click empty space in a cell to add a transaction.", icon: "🔍", target: "[data-tour='calendar']", pos: "top" },
          { title: "Daily Balance", text: "The bar at the bottom of each day shows its running balance. Click it to set a balance reset.", icon: "💰", target: "[data-tour='calendar']", pos: "top" },
          { title: "Drag to Move", text: "Drag any transaction to a different day. For recurring items, choose 'just this one' or 'all future'.", icon: "✋", target: "[data-tour='calendar']", pos: "top" },
          { title: "Negative Day Advice", text: "The 💡 lightbulb appears on negative days. Click for strategies to stay above zero.", icon: "💡", target: "[data-tour='calendar']", pos: "top" },
          { title: "Backup & Restore", text: "Download your data anytime. Restore from a backup. The palette icon, font size, and debt distribution are here too.", icon: "💾", target: "[data-tour='footer']", pos: "top" },
          { title: "You're Ready!", text: "Explore your month. Click transactions to edit. Drag to reschedule. You got this.", icon: "🚀", target: "[data-tour='logo']", pos: "bottom" },
        ];
        const step = steps[tutorialStep];
        const isLast = tutorialStep === steps.length - 1;
        const targetEl = typeof document !== "undefined" ? document.querySelector(step.target) : null;
        const rect = targetEl?.getBoundingClientRect();
        // Card positioning
        let cardStyle: React.CSSProperties = { position: "fixed", zIndex: 101 };
        if (rect) {
          if (step.pos === "bottom") {
            cardStyle.top = rect.bottom + 12;
            cardStyle.left = Math.max(16, Math.min(rect.left, window.innerWidth - 380));
          } else if (step.pos === "top") {
            cardStyle.bottom = window.innerHeight - rect.top + 12;
            cardStyle.left = Math.max(16, Math.min(rect.left, window.innerWidth - 380));
          }
        } else {
          cardStyle.top = "50%";
          cardStyle.left = "50%";
          cardStyle.transform = "translate(-50%, -50%)";
        }
        // Spotlight cutout
        const spotStyle: React.CSSProperties = rect ? {
          position: "fixed", left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12,
          borderRadius: 12, boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)", zIndex: 100, pointerEvents: "none",
        } : {};

        return (<>
          {/* Dark overlay with spotlight hole */}
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }}
            onClick={() => { step.exit?.(); setTutorialStep(-1); localStorage.setItem("flowycash-tutorial-done", "1"); setShowTagPills(false); setShowDashboard(false); }} />
          {rect && <div style={spotStyle} />}
          {/* Tooltip card */}
          <div style={{ ...cardStyle, background: "#fff", borderRadius: 16, width: 360, maxWidth: "90vw", boxShadow: "0 12px 40px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ height: 3, background: "#e2e8f0" }}>
              <div style={{ height: "100%", background: th.accent, width: `${((tutorialStep + 1) / steps.length) * 100}%`, transition: "width 0.3s", borderRadius: 3 }} />
            </div>
            <div style={{ padding: "20px 22px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 28 }}>{step.icon}</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b", letterSpacing: "-0.02em" }}>{step.title}</div>
              </div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 16 }}>{step.text}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 5 }}>
                  {steps.map((_, i) => (
                    <div key={i} onClick={() => setTutorialStep(i)}
                      style={{ width: i === tutorialStep ? 16 : 6, height: 6, borderRadius: 3, background: i === tutorialStep ? th.headerBg : "#e2e8f0", cursor: "pointer", transition: "all 0.2s" }} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { step.exit?.(); setTutorialStep(-1); localStorage.setItem("flowycash-tutorial-done", "1"); setShowTagPills(false); setShowDashboard(false); }}
                    style={{ border: "none", background: "none", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}>Skip</button>
                  {tutorialStep > 0 && (
                    <button onClick={() => { step.exit?.(); const prev = steps[tutorialStep - 1]; prev.enter?.(); setTutorialStep((s) => s - 1); }} className="bf-btn"
                      style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 12, fontWeight: 600 }}>Back</button>
                  )}
                  <button onClick={() => {
                    step.exit?.();
                    if (isLast) { setTutorialStep(-1); localStorage.setItem("flowycash-tutorial-done", "1"); }
                    else { const next = steps[tutorialStep + 1]; next.enter?.(); setTutorialStep((s) => s + 1); }
                  }} className="bf-btn"
                    style={{ padding: "6px 18px", borderRadius: 8, border: "none", background: th.headerBg, color: "#fff", fontSize: 12, fontWeight: 600 }}>
                    {isLast ? "Done" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>);
      })()}

      {/* Floating Ask button for phones, where the header icons do not fit */}
      {!askOpen && (
        <button onClick={() => setAskOpen(true)} className="bf-btn ask-fab" title="Ask or tell Flowy"
          style={{ position: "fixed", right: 18, bottom: 64, zIndex: 60, width: 52, height: 52, borderRadius: "50%", border: "none", background: th.accent, color: "#fff", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      )}

      {/* Voice feedback */}
      {(listening || voiceResult) && (
        <div style={{ position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)", zIndex: 100, animation: "panelIn 0.15s ease" }}>
          <div style={{ background: listening ? "#1e293b" : "#fff", borderRadius: 16, padding: "12px 24px", boxShadow: "0 8px 30px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 12, minWidth: 240, maxWidth: 500 }}>
            {listening && (
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ef4444", animation: "pulse 1s infinite", flexShrink: 0 }} />
            )}
            <div>
              {listening && <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Listening...</div>}
              {voiceText && <div style={{ fontSize: 14, color: listening ? "#fff" : "#1e293b", fontWeight: 600 }}>{voiceText}</div>}
              {voiceResult && <div style={{ fontSize: 13, color: listening ? "#94a3b8" : "#059669", marginTop: 2 }}>{voiceResult}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Share message toast */}
      {shareMsg && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 100, animation: "panelIn 0.15s ease", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
          {shareMsg}
        </div>
      )}

      {/* Touch drag ghost */}
      <div ref={ghostRef} style={{ display: "none", position: "fixed", pointerEvents: "none", zIndex: 100,
        background: "#fff", borderRadius: 8, padding: "6px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", border: "1.5px solid #3b82f6",
        fontSize: 13, fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap" }} />

    </div>
  );
}
