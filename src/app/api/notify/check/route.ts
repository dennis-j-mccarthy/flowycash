import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { buildDriftReport, renderEmail } from "@/lib/notify";
import type { AppState } from "@/lib/types";

// Daily drift check. Idempotent: it only reads the current forecast and, if
// there's drift, sends a summary email — no database writes, so it's safe to
// call repeatedly (a re-run on the same data produces the same result).
//
// Wire to Vercel Cron by adding to vercel.json:
//   { "crons": [{ "path": "/api/notify/check", "schedule": "0 13 * * *" }] }
// Vercel Cron issues a GET, so a GET handler is provided alongside POST. When
// CRON_SECRET is set, Vercel sends it as "Authorization: Bearer <CRON_SECRET>"
// and we enforce it; if unset, the endpoint is open (fine for local/manual use).
//
// Env vars: RESEND_API_KEY, RESEND_FROM_EMAIL, NOTIFY_TO_EMAIL. Optional:
// CRON_SECRET, NOTIFY_USER_ID (defaults to "default").

async function loadState(userId: string): Promise<AppState> {
  const [transactions, overrides, balanceResets, settings] = await Promise.all([
    prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.override.findMany({ where: { transaction: { userId } } }),
    prisma.balanceReset.findMany({ where: { userId } }),
    prisma.settings.findFirst({ where: { userId } }),
  ]);
  const overridesMap: Record<string, (typeof overrides)[number]> = {};
  overrides.forEach((o) => { overridesMap[`${o.transactionId}::${o.occurrenceDate}`] = o; });
  const resetsMap: Record<string, number> = {};
  balanceResets.forEach((r) => { resetsMap[r.date] = r.amount; });
  return {
    transactions: transactions as unknown as AppState["transactions"],
    overrides: overridesMap as unknown as AppState["overrides"],
    balanceResets: resetsMap,
    startingBalance: settings?.startingBalance ?? 0,
  };
}

async function handle(req: NextRequest) {
  try {
    if (process.env.CRON_SECRET) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const userId = req.nextUrl.searchParams.get("userId") || process.env.NOTIFY_USER_ID || "default";
    const state = await loadState(userId);
    const report = buildDriftReport(state, {
      largeMin: Number(process.env.NOTIFY_LARGE_MIN) || 300,
      leadDays: Number(process.env.NOTIFY_LEAD_DAYS) || 3,
    });
    const email = renderEmail(report);

    // Allow forcing a send (e.g. a test) even when there are no findings.
    const force = req.nextUrl.searchParams.get("force") === "1";
    if (!report.hasFindings && !force) {
      return NextResponse.json({ sent: false, reason: "no findings", report });
    }

    // NOTIFY_TO_EMAIL may be a comma-separated list of recipients.
    const to = (process.env.NOTIFY_TO_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
    const from = process.env.RESEND_FROM_EMAIL;
    if (!process.env.RESEND_API_KEY || to.length === 0 || !from) {
      // Nothing to send with — return the rendered content so it can still be previewed.
      return NextResponse.json({ sent: false, reason: "resend not configured", report, email: { subject: email.subject, text: email.text } });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error) {
      return NextResponse.json({ sent: false, error: String(error), report }, { status: 502 });
    }
    return NextResponse.json({ sent: true, id: data?.id, report });
  } catch (e) {
    console.error("/api/notify/check error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
