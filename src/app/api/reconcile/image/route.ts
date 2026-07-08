import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { BankAccount, BankTransaction } from "@/lib/reconcile";

// Structured-output schema the vision model is constrained to. Kept flat: no
// string/number constraints, additionalProperties:false everywhere (required by
// output_config.format on Sonnet 4.6).
const SCHEMA = {
  type: "object",
  properties: {
    screenType: { type: "string", enum: ["accounts", "transactions", "unknown"] },
    accounts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          last4: { type: "string" },
          balance: { type: "number" },
        },
        required: ["name", "last4", "balance"],
        additionalProperties: false,
      },
    },
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          name: { type: "string" },
          amount: { type: "number" },
          runningBalance: { anyOf: [{ type: "number" }, { type: "null" }] },
        },
        required: ["date", "name", "amount", "runningBalance"],
        additionalProperties: false,
      },
    },
  },
  required: ["screenType", "accounts", "transactions"],
  additionalProperties: false,
} as const;

function prompt(today: string) {
  return `You are reading a screenshot from a bank or credit-card app. First classify which kind of screen it is:

- "accounts": an accounts/summary screen listing one or more accounts, each with a name and/or last-4 digits and a current balance. No per-transaction rows.
- "transactions": a transaction/activity list with individual rows (merchant/description, date, amount, and often a running balance). Posted and pending sections both count.
- "unknown": neither of the above.

Then extract accordingly:
- For "accounts": fill "accounts" with one entry per account row (name, last4 as the last 4 digits or "" if not shown, balance as a number). Leave "transactions" empty.
- For "transactions": fill "transactions" with one entry per row. Leave "accounts" empty.

Rules for transaction rows:
- date: YYYY-MM-DD. Today is ${today}. If a row shows no year, assume the most recent past date on or before today.
- amount: a signed number. Debits, purchases, withdrawals, and payments are NEGATIVE. Deposits and credits are POSITIVE.
- runningBalance: the account balance shown for that row as a number, or null if the screen shows no per-row balance.

Only report what is actually visible. Do not invent rows.`;
}

interface VisionResult {
  screenType: string;
  accounts: BankAccount[];
  transactions: BankTransaction[];
}

async function analyze(client: Anthropic, base64: string, mediaType: string, today: string): Promise<VisionResult> {
  const data = base64.replace(/^data:[^;]+;base64,/, "");
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/png", data },
          },
          { type: "text", text: prompt(today) },
        ],
      },
    ],
  });
  const text = res.content.find((b) => b.type === "text");
  const parsed = JSON.parse(text && text.type === "text" ? text.text : "{}");
  return {
    screenType: parsed.screenType || "unknown",
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
    }
    const body = await req.json();
    // Accept a single { image, mediaType } or an array of { base64, mediaType }.
    const images: { base64: string; mediaType: string }[] = Array.isArray(body.images)
      ? body.images
      : body.image
        ? [{ base64: body.image, mediaType: body.mediaType || "image/png" }]
        : [];
    if (images.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }

    const client = new Anthropic();
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const results = await Promise.all(
      images.slice(0, 6).map((img) => analyze(client, img.base64, img.mediaType || "image/png", today)),
    );

    // Merge: accounts screenshots supply the authoritative balance, transaction
    // screenshots supply the detail. Collapse everything into one bank dataset.
    const accounts = results.flatMap((r) => r.accounts);
    const transactions = results.flatMap((r) => r.transactions);
    const screenType = accounts.length && transactions.length ? "mixed" : accounts.length ? "accounts" : transactions.length ? "transactions" : "unknown";

    return NextResponse.json({ screenType, accounts, transactions });
  } catch (e) {
    console.error("POST /api/reconcile/image error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
