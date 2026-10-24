import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { calendarFeedUrl } from "@/lib/calendar";

// Returns the signed-in user's personal calendar feed URL.
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Calendar feed is not configured" }, { status: 500 });
  const userId = await resolveUserId(clerkId);
  const origin = `${req.nextUrl.protocol}//${req.headers.get("host") || req.nextUrl.host}`;
  const url = calendarFeedUrl(origin, userId);
  return NextResponse.json({ url, webcal: url.replace(/^https?:\/\//, "webcal://") });
}
