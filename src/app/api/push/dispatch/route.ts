import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";

export const dynamic = "force-dynamic";

function todayInET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

// Mirrors getOccurrences in src/app/app/page.tsx, checking a single date
function occursOn(startDate: string, recurrence: string, date: string, endDate?: string | null): boolean {
  if (endDate && date > endDate) return false;
  if (recurrence === "none") return startDate === date;
  if (startDate > date) return false;
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ty, tm, td] = date.split("-").map(Number);
  if (recurrence === "weekly" || recurrence === "biweekly") {
    const start = Date.UTC(sy, sm - 1, sd);
    const target = Date.UTC(ty, tm - 1, td);
    const days = Math.round((target - start) / 86400000);
    return days % (recurrence === "weekly" ? 7 : 14) === 0;
  }
  if (recurrence === "monthly") {
    // Fires on the same day-of-month; does not replicate the calendar's
    // Date-rollover walk for day-29/30/31 starts in short months
    return td === sd;
  }
  if (recurrence === "yearly") return tm === sm && td === sd;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return NextResponse.json({ error: "VAPID keys not configured" }, { status: 500 });
    }
    webpush.setVapidDetails(
      "mailto:support@flowycash.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const today = todayInET();
    const txs = await prisma.transaction.findMany({
      where: { reminder: true },
      include: { overrides: true },
    });

    // A transaction is due today if a natural occurrence lands on today and
    // wasn't deleted or moved away, or if an occurrence was moved to today
    const due: { tx: (typeof txs)[number]; name: string; amount: number; type: string }[] = [];
    for (const tx of txs) {
      const natural = occursOn(tx.startDate, tx.recurrence, today, tx.endDate);
      const ovToday = tx.overrides.find((o) => o.occurrenceDate === today);
      if (natural && !ovToday?.deleted && !(ovToday?.movedTo && ovToday.movedTo !== today)) {
        due.push({ tx, name: ovToday?.name ?? tx.name, amount: ovToday?.amount ?? tx.amount, type: ovToday?.type ?? tx.type });
        continue;
      }
      const movedHere = tx.overrides.find((o) => o.movedTo === today && !o.deleted);
      if (movedHere) {
        due.push({ tx, name: movedHere.name ?? tx.name, amount: movedHere.amount ?? tx.amount, type: movedHere.type ?? tx.type });
      }
    }

    if (due.length === 0) return NextResponse.json({ sent: 0, date: today });

    const userIds = [...new Set(due.map((d) => d.tx.userId))];
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    const subsByUser: Record<string, typeof subs> = {};
    for (const s of subs) (subsByUser[s.userId] ||= []).push(s);

    let sent = 0;
    const deadEndpoints: string[] = [];
    for (const d of due) {
      const already = await prisma.reminderLog.findUnique({
        where: { transactionId_date: { transactionId: d.tx.id, date: today } },
      });
      if (already) continue;
      const userSubs = subsByUser[d.tx.userId] || [];
      if (userSubs.length === 0) continue;
      const amt = Math.abs(d.amount).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
      const payload = JSON.stringify({
        title: d.type === "income" ? `${d.name} arrives today` : `${d.name} due today`,
        body: `${amt} ${d.type === "income" ? "expected" : "scheduled"} for today`,
        tag: `flowycash-reminder-${d.tx.id}-${today}`,
        url: "/app",
      });
      let delivered = false;
      for (const sub of userSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          delivered = true;
        } catch (e: unknown) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) deadEndpoints.push(sub.endpoint);
          else console.error("push send error:", e);
        }
      }
      if (delivered) {
        await prisma.reminderLog.create({ data: { transactionId: d.tx.id, date: today } });
        sent++;
      }
    }

    if (deadEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: deadEndpoints } } });
    }

    return NextResponse.json({ sent, due: due.length, date: today, removedDead: deadEndpoints.length });
  } catch (e) {
    console.error("GET /api/push/dispatch error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
