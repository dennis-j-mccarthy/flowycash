import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import type { AppState } from "@/lib/types";
import { bucketByDate, expandOccurrences } from "@/lib/notify";

export const maxDuration = 60;

// One flat action shape so the tool schema can be strict. Fields that do not
// apply to a kind are null.
export interface AssistantAction {
  kind: "move" | "set_amount" | "skip" | "add" | "go_to_month" | "show_day" | "search";
  transactionId: string | null;
  occurrenceDate: string | null;
  newDate: string | null;
  scope: "one" | "future" | null;
  amount: number | null;
  name: string | null;
  type: "income" | "expense" | null;
  recurrence: "none" | "weekly" | "biweekly" | "monthly" | "yearly" | null;
  date: string | null;
  query: string | null;
}

const PROPOSE_TOOL: Anthropic.Tool = {
  name: "propose_actions",
  description:
    "Propose one or more changes to the user's cashflow calendar. The user will see the list and confirm before anything is applied. " +
    "Use this whenever the user asks to move, reschedule, change, skip, delete, or add a payment, or to jump to a month, open a day, or search. " +
    "Do not call it for questions that only need an answer.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "actions"],
    properties: {
      summary: { type: "string", description: "One short sentence telling the user what will happen, in plain words." },
      actions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "transactionId", "occurrenceDate", "newDate", "scope", "amount", "name", "type", "recurrence", "date", "query"],
          properties: {
            kind: { type: "string", enum: ["move", "set_amount", "skip", "add", "go_to_month", "show_day", "search"] },
            transactionId: { type: ["string", "null"], description: "move/set_amount/skip: the series id from the transactions list." },
            occurrenceDate: { type: ["string", "null"], description: "move/set_amount/skip: the occurrenceDate (YYYY-MM-DD) of the specific occurrence, from the occurrences list. Not the display date." },
            newDate: { type: ["string", "null"], description: "move: the target date YYYY-MM-DD." },
            scope: { anyOf: [{ type: "string", enum: ["one", "future"] }, { type: "null" }], description: "move/set_amount/skip on a recurring series: 'one' changes only this occurrence (default), 'future' changes this and every later one. Use 'future' only when the user says so (from now on, permanently, every month, going forward)." },
            amount: { type: ["number", "null"], description: "set_amount/add: positive dollar amount." },
            name: { type: ["string", "null"], description: "add: the payment name." },
            type: { anyOf: [{ type: "string", enum: ["income", "expense"] }, { type: "null" }], description: "add: income or expense." },
            recurrence: { anyOf: [{ type: "string", enum: ["none", "weekly", "biweekly", "monthly", "yearly"] }, { type: "null" }], description: "add: how often. 'none' for one-time." },
            date: { type: ["string", "null"], description: "add: first date YYYY-MM-DD. go_to_month: any date in that month. show_day: the day to open." },
            query: { type: ["string", "null"], description: "search: text to search for." },
          },
        },
      },
    },
  },
};

const SYSTEM = `You are the assistant inside Flowy Cash, a personal cashflow calendar. The user types or dictates short requests, often on a phone.

You get the user's full plan as JSON: recurring and one-time payments (series), the concrete occurrences across a few months (each with its series id, its occurrenceDate, and the date it currently shows on after any moves), and the running balance for each day of the month they are looking at.

Answering questions:
- Answer in one to three short sentences. Name the exact dates (like "Friday, Oct 3") and amounts. No lists unless there are several items.
- "Where is X" or "when is X" means: which date(s) does X fall on in the month being viewed; if none, say the next date it falls on.
- "What's my balance on the 15th" or "lowest point this month" come from the daily balances.
- Match names loosely: "Bob payment", "bob", "the Bob thing" all match a series named "Bob Loan". If two series could match, ask which one in a single sentence instead of guessing.
- Never invent a payment that is not in the data. If something is not there, say so.

Making changes:
- When the user asks to move, reschedule, change the amount of, skip, delete, or add a payment, call propose_actions. Resolve relative dates from today and the month being viewed: "Tuesday" means the next Tuesday on or after the occurrence's current date unless the user says otherwise; "next week" means seven days later; "the 20th" means the 20th of the month being viewed.
- Pick the occurrence in the month being viewed, even if it is already past; the user is often fixing up the current month. If the user names a day ("the 12th"), that day is in the month being viewed. Only use a later month when the user says so or the series has no occurrence in the viewed month.
- Default scope is "one". Use "future" only if the user clearly means the whole series going forward.
- For navigation requests ("show November", "go to next month", "open the 14th", "find Netflix") use go_to_month, show_day, or search.
- The summary must say what will change in plain words, including the from and to dates.

Keep replies short. No markdown, no emoji.`;

function pdk(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}
function dkey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function dim(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function addDays(s: string, n: number) {
  const { year, month, day } = pdk(s);
  const d = new Date(year, month, day);
  d.setDate(d.getDate() + n);
  return dkey(d.getFullYear(), d.getMonth(), d.getDate());
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dow(s: string) {
  const { year, month, day } = pdk(s);
  return DOW[new Date(year, month, day).getDay()];
}

// Running balance per day of [rStart, rEnd], walked from the earliest series
// start date through every reset, the same way the dashboard does it.
function dailyBalances(state: AppState, rStart: string, rEnd: string) {
  const resets = state.balanceResets || {};
  const starts = (state.transactions || []).map((t) => t.startDate).filter(Boolean).sort();
  const from = starts[0] && starts[0] < rStart ? starts[0] : rStart;
  const buckets = bucketByDate(state, from, rEnd);
  let bal = state.startingBalance || 0;
  const out: { date: string; balance: number }[] = [];
  let cur = from;
  while (cur <= rEnd) {
    if (resets[cur] !== undefined) bal = resets[cur];
    bal += buckets[cur] || 0;
    if (cur >= rStart) out.push({ date: cur, balance: Math.round(bal * 100) / 100 });
    cur = addDays(cur, 1);
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
    }
    const { userId } = await auth();
    const body = await req.json();
    const text: string = (body.text || "").toString().trim();
    const state: AppState | undefined = body.state;
    if (!text || !state || !Array.isArray(state.transactions)) {
      return NextResponse.json({ error: "text and state are required" }, { status: 400 });
    }
    // Demo mode has no sign-in; it sends demo data that never touches the database.
    if (!userId && !body.demo) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const now = new Date();
    const today: string = body.today || dkey(now.getFullYear(), now.getMonth(), now.getDate());
    const vy: number = typeof body.year === "number" ? body.year : now.getFullYear();
    const vm: number = typeof body.month === "number" ? body.month : now.getMonth();
    const rStart = dkey(vy, vm, 1);
    const rEnd = dkey(vy, vm, dim(vy, vm));
    const winStart = dkey(vm === 0 ? vy - 1 : vy, vm === 0 ? 11 : vm - 1, 1);
    const winEndM = (vm + 2) % 12;
    const winEndY = vm + 2 > 11 ? vy + 1 : vy;
    const winEnd = dkey(winEndY, winEndM, dim(winEndY, winEndM));

    const series = state.transactions.map((t) => ({
      id: t.id, name: t.name, amount: Math.abs(t.amount), type: t.type, recurrence: t.recurrence,
      startDate: t.startDate, endDate: t.endDate || null, autopay: !!t.autopay, tags: t.tags || "",
    }));
    const occurrences = expandOccurrences(state, winStart, winEnd)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((o) => ({ transactionId: o.transactionId, name: o.name, occurrenceDate: o.occurrenceDate, date: o.date, weekday: dow(o.date), amount: o.amount, type: o.type }));
    const balances = dailyBalances(state, rStart, rEnd).map((b) => ({ date: b.date, weekday: dow(b.date), balance: b.balance }));

    const context = {
      today: `${today} (${dow(today)})`,
      viewingMonth: `${vy}-${String(vm + 1).padStart(2, "0")}`,
      series,
      occurrences,
      dailyBalancesForViewingMonth: balances,
    };

    const history: { role: "user" | "assistant"; text: string }[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: [{ type: "text", text: `Plan data:\n${JSON.stringify(context)}` }] },
      { role: "assistant", content: "Got it. What would you like to know or change?" },
      ...history.map((h) => ({ role: h.role, content: h.text }) as Anthropic.MessageParam),
      { role: "user", content: text },
    ];

    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [PROPOSE_TOOL],
      tool_choice: { type: "auto" },
      output_config: { effort: "medium" },
      messages,
    });

    if (res.stop_reason === "refusal") {
      return NextResponse.json({ reply: "I can't help with that one.", actions: [] });
    }

    let reply = "";
    let actions: AssistantAction[] = [];
    for (const block of res.content) {
      if (block.type === "text") reply += (reply ? " " : "") + block.text.trim();
      else if (block.type === "tool_use" && block.name === "propose_actions") {
        const input = block.input as { summary?: string; actions?: AssistantAction[] };
        if (input.summary) reply = reply ? `${reply} ${input.summary}` : input.summary;
        if (Array.isArray(input.actions)) actions = input.actions;
      }
    }
    return NextResponse.json({ reply: reply || "Done.", actions });
  } catch (e) {
    console.error("POST /api/assistant error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
