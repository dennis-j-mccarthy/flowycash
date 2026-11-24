import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

// Turns the numbers the Catch-up flow computed into a short, calm, plain read.
// The client sends only aggregates (no ids, no names beyond the items shown),
// and the model is told to narrate, not to invent.

interface Facts {
  gapDays: number;
  guess: number | null;
  forecastToday: number;
  actual: number;
  delta: number; // actual - forecastToday
  confirmed: { happened: number; skipped: number; changed: number; added: number };
  lowest: { date: string; bal: number };
  negativeDays: number;
  nextIncome: { date: string; name: string; amount: number } | null;
  bigUpcoming: { date: string; name: string; amount: number }[];
  endOfWindow: { date: string; bal: number };
  windowDays: number;
  today: string;
}

const SYSTEM = `You write the closing note for a budgeting app's "catch up" check-in. The user has been away from their cashflow calendar for a while, felt a bit of dread about it, and just worked through: guessing their balance, confirming which large items happened, and entering their real bank balance. You now have the numbers.

Write 3 to 5 short sentences, plain English, second person, calm and specific. Rules:
- Lead with the honest verdict in the first sentence: either things are fine, things are tight but workable, or there is a real problem on a specific date. Never bury it.
- Use the actual numbers given. Do not invent numbers, items, or dates.
- If the guess was close to the actual, say so in a sentence, because it means their sense of their money is good. If it was far off, say which direction without any judgment.
- If the lowest point in the window is above zero, say what the lowest point is and when, and that nothing needs to move.
- If it dips below zero, name the date and the amount and point to the next income date, and suggest the one most useful move (an item to shift past payday) using only the items listed.
- No exclamation marks, no emoji, no praise words like "great job", no headers, no bullet points. Dollar amounts like $1,234. Dates like Nov 14.`;

function fmt(n: number) {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (n < 0 ? "-$" : "$") + s;
}
function nice(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fallback(f: Facts) {
  const parts: string[] = [];
  if (f.lowest.bal >= 0) parts.push(`You are fine for the next ${f.windowDays} days. The lowest the balance gets is ${fmt(f.lowest.bal)} on ${nice(f.lowest.date)}, and nothing needs to move.`);
  else parts.push(`There is one tight spot: the balance dips to ${fmt(f.lowest.bal)} on ${nice(f.lowest.date)}${f.nextIncome ? `, and the next income is ${fmt(f.nextIncome.amount)} on ${nice(f.nextIncome.date)}` : ""}.`);
  if (f.guess != null) {
    const off = Math.abs(f.guess - f.actual);
    parts.push(off <= Math.max(50, Math.abs(f.actual) * 0.05) ? `Your guess of ${fmt(f.guess)} was close to the real ${fmt(f.actual)}, so your sense of where you stand is good.` : `You guessed ${fmt(f.guess)} and the real number is ${fmt(f.actual)}.`);
  }
  parts.push(`The calendar now starts from ${fmt(f.actual)} today, ${f.delta >= 0 ? "" : "which is "}${fmt(Math.abs(f.delta))} ${f.delta >= 0 ? "more" : "less"} than the plan expected.`);
  return parts.join(" ");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const facts = body?.facts as Facts | undefined;
  if (!facts || typeof facts.actual !== "number") return NextResponse.json({ error: "facts required" }, { status: 400 });

  const { userId } = await auth();
  if (!userId && !body.demo) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ note: fallback(facts), source: "fallback" });

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: "user", content: `Today is ${facts.today}. Here are the numbers as JSON:\n${JSON.stringify(facts)}` }],
    });
    const text = res.content.find((b) => b.type === "text");
    const note = text && text.type === "text" ? text.text.trim() : "";
    return NextResponse.json({ note: note || fallback(facts), source: note ? "model" : "fallback" });
  } catch {
    return NextResponse.json({ note: fallback(facts), source: "fallback" });
  }
}
