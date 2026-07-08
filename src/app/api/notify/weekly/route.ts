import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { buildMonthDashboard, renderDashboardEmail } from "@/lib/notify";
import { loadState } from "@/lib/load-state";

// Monday-morning monthly dashboard. Unlike /api/notify/check (which only emails
// when there's drift to report), this always sends a snapshot summary.
//
// Wire to Vercel Cron via vercel.json:
//   { "path": "/api/notify/weekly", "schedule": "0 12 * * 1" }   // Mon 8am ET
// If CRON_SECRET is set, Vercel sends it as "Authorization: Bearer <secret>".
//
// Env: RESEND_API_KEY, RESEND_FROM_EMAIL, NOTIFY_TO_EMAIL (comma-separated),
// NOTIFY_USER_ID (defaults to "default").

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
    const dashboard = buildMonthDashboard(state);
    const email = renderDashboardEmail(dashboard);

    const to = (process.env.NOTIFY_TO_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
    const from = process.env.RESEND_FROM_EMAIL;
    if (!process.env.RESEND_API_KEY || to.length === 0 || !from) {
      return NextResponse.json({ sent: false, reason: "resend not configured", dashboard, email: { subject: email.subject, text: email.text } });
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
      return NextResponse.json({ sent: false, error: String(error), dashboard }, { status: 502 });
    }
    return NextResponse.json({ sent: true, id: data?.id, dashboard });
  } catch (e) {
    console.error("/api/notify/weekly error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
