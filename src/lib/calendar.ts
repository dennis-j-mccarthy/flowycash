import { createHmac } from "crypto";

// Token for the per-user calendar feed URL. Calendar apps cannot send a Clerk
// session, so the URL carries the user id and this HMAC of it. Signed with
// CRON_SECRET when set, else the Clerk secret, so no new env var is needed.
export function calendarSecret(): string {
  return process.env.CRON_SECRET || process.env.CLERK_SECRET_KEY || "";
}
export function calendarToken(userId: string): string {
  return createHmac("sha256", calendarSecret()).update(`calendar:${userId}`).digest("hex").slice(0, 32);
}

export function calendarFeedUrl(origin: string, userId: string): string {
  return `${origin}/api/calendar.ics?u=${encodeURIComponent(userId)}&t=${calendarToken(userId)}`;
}
