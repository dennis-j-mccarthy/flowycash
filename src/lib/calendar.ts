import { createHmac } from "crypto";

// Token for the per-user calendar feed URL. Calendar apps cannot send a Clerk
// session, so the URL carries the user id and this HMAC of it. The secret is
// the existing CRON_SECRET so no new env var is needed.
export function calendarToken(userId: string): string {
  const secret = process.env.CRON_SECRET || "";
  return createHmac("sha256", secret).update(`calendar:${userId}`).digest("hex").slice(0, 32);
}

export function calendarFeedUrl(origin: string, userId: string): string {
  return `${origin}/api/calendar.ics?u=${encodeURIComponent(userId)}&t=${calendarToken(userId)}`;
}
