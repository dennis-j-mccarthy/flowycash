import { timingSafeEqual } from "crypto";
import { calendarToken } from "@/lib/calendar";
import { NextRequest, NextResponse } from "next/server";
import { expandOccurrences } from "@/lib/notify";
import { loadState } from "@/lib/load-state";

// Subscribable calendar of flagged payments. Calendar apps cannot send a Clerk
// session, so the URL carries the user id and an HMAC of it. The secret is the
// existing CRON_SECRET so no new env var is needed.
export const dynamic = "force-dynamic";


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
function icsDate(s: string) {
  return s.replace(/-/g, "");
}
function icsText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function money(v: number) {
  return `$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  const t = req.nextUrl.searchParams.get("t") || "";
  if (!u || !t || !process.env.CRON_SECRET) {
    return new NextResponse("Not found", { status: 404 });
  }
  const expected = calendarToken(u);
  if (t.length !== expected.length || !timingSafeEqual(Buffer.from(t), Buffer.from(expected))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const state = await loadState(u);
  const now = new Date();
  const today = dkey(now.getFullYear(), now.getMonth(), now.getDate());
  const from = addDays(today, -30);
  const to = addDays(today, 180);
  const occs = expandOccurrences(state, from, to)
    .filter((o) => o.reminder && o.date >= from && o.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));

  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Flowy Cash//Payments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Flowy Cash",
    "X-WR-CALDESC:Payments you flagged for a reminder in Flowy Cash",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const o of occs) {
    const label = o.type === "income" ? `${o.name} ${money(o.amount)} arrives` : `${o.name} ${money(o.amount)} due`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${o.transactionId}-${o.occurrenceDate}@flowycash.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(o.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(o.date, 1))}`,
      `SUMMARY:${icsText(label)}`,
      `DESCRIPTION:${icsText(`${o.type === "income" ? "Income" : "Payment"}: ${o.name}, ${money(o.amount)}. Set in Flowy Cash.`)}`,
      "URL:https://www.flowycash.com/app",
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsText(label)}`,
      "TRIGGER;RELATED=START:PT9H",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  // RFC 5545 folds lines at 75 octets.
  const folded = lines.flatMap((l) => {
    const out: string[] = [];
    let rest = l;
    while (rest.length > 73) { out.push(rest.slice(0, 73)); rest = " " + rest.slice(73); }
    out.push(rest);
    return out;
  });
  return new NextResponse(folded.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="flowycash.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
