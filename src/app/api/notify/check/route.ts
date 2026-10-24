import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { clerkClient } from "@clerk/nextjs/server";
import { buildDriftReport, renderEmail } from "@/lib/notify";
import { loadState } from "@/lib/load-state";
import { prisma } from "@/lib/prisma";

// Daily drift check, one email per user. Idempotent: it only reads the current
// forecast and, if there is anything to say (flagged reminders due today or
// tomorrow, large payments, a dip, overdue items, drift), sends that user a
// summary. No database writes.
//
// Vercel Cron issues a GET at the schedule in vercel.json. When CRON_SECRET is
// set, Vercel sends "Authorization: Bearer <CRON_SECRET>" and we enforce it.
//
// Recipients: each user's primary email from Clerk. NOTIFY_USER_ID +
// NOTIFY_TO_EMAIL remain as an override for one account (comma-separated list
// allowed), which is how the original single-user setup worked.
//
// Env vars: RESEND_API_KEY, RESEND_FROM_EMAIL. Optional: CRON_SECRET,
// NOTIFY_USER_ID, NOTIFY_TO_EMAIL, NOTIFY_LARGE_MIN, NOTIFY_LEAD_DAYS.

async function recipientsFor(userId: string): Promise<string[]> {
  if (process.env.NOTIFY_USER_ID && userId === process.env.NOTIFY_USER_ID) {
    const list = (process.env.NOTIFY_TO_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length) return list;
  }
  if (!userId.startsWith("user_")) return [];
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) || user.emailAddresses[0];
    return primary?.emailAddress ? [primary.emailAddress] : [];
  } catch {
    return [];
  }
}

async function handle(req: NextRequest) {
  try {
    if (process.env.CRON_SECRET) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const only = req.nextUrl.searchParams.get("userId");
    const force = req.nextUrl.searchParams.get("force") === "1";
    const userIds = only
      ? [only]
      : (await prisma.transaction.findMany({ select: { userId: true }, distinct: ["userId"] })).map((r) => r.userId);

    const from = process.env.RESEND_FROM_EMAIL;
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    const results: { userId: string; sent: boolean; reason?: string; to?: string[]; id?: string; subject?: string }[] = [];

    for (const userId of userIds) {
      const state = await loadState(userId);
      if (state.transactions.length === 0) continue;
      const report = buildDriftReport(state, {
        largeMin: Number(process.env.NOTIFY_LARGE_MIN) || 300,
        leadDays: Number(process.env.NOTIFY_LEAD_DAYS) || 3,
      });
      if (!report.hasFindings && !force) {
        results.push({ userId, sent: false, reason: "no findings" });
        continue;
      }
      const email = renderEmail(report);
      const to = await recipientsFor(userId);
      if (to.length === 0) {
        results.push({ userId, sent: false, reason: "no email address", subject: email.subject });
        continue;
      }
      if (!resend || !from) {
        results.push({ userId, sent: false, reason: "resend not configured", to, subject: email.subject });
        continue;
      }
      const { data, error } = await resend.emails.send({ from, to, subject: email.subject, html: email.html, text: email.text });
      if (error) {
        results.push({ userId, sent: false, reason: String(error), to, subject: email.subject });
        continue;
      }
      results.push({ userId, sent: true, to, id: data?.id, subject: email.subject });
    }

    // Single-user runs keep the old response shape's useful parts for previewing.
    if (only && results.length === 1) {
      const state = await loadState(only);
      const report = buildDriftReport(state, { largeMin: Number(process.env.NOTIFY_LARGE_MIN) || 300, leadDays: Number(process.env.NOTIFY_LEAD_DAYS) || 3 });
      const email = renderEmail(report);
      return NextResponse.json({ ...results[0], report, email: { subject: email.subject, text: email.text } });
    }
    return NextResponse.json({ users: userIds.length, sent: results.filter((r) => r.sent).length, results });
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
