import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { plaidConfigured } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { syncItem } from "@/lib/plaid-sync";

export const maxDuration = 60;

// POST (signed in): sync the caller's linked banks. ?apply=1 writes today's
// balance reset and the already-cleared moves; without it the call is read
// only and returns what it would do.
export async function POST(req: NextRequest) {
  if (!plaidConfigured()) return NextResponse.json({ error: "Plaid is not configured" }, { status: 500 });
  const { userId: clerkId } = await auth();
  let userId: string;
  try { userId = await resolveUserId(clerkId); } catch { return NextResponse.json({ error: "Not signed in" }, { status: 401 }); }
  const apply = req.nextUrl.searchParams.get("apply") === "1";
  const items = await prisma.plaidItem.findMany({ where: { userId } });
  const results = [];
  for (const item of items) results.push(await syncItem(item, { apply }));
  return NextResponse.json({ results });
}

// GET (Vercel cron, Authorization: Bearer CRON_SECRET): nightly sync for
// every linked bank, applying resets. Items in login_required are skipped
// until the user re-links.
export async function GET(req: NextRequest) {
  if (!plaidConfigured()) return NextResponse.json({ error: "Plaid is not configured" }, { status: 500 });
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const items = await prisma.plaidItem.findMany({ where: { status: { not: "login_required" } } });
  const summary = [];
  for (const item of items) {
    const r = await syncItem(item, { apply: true });
    summary.push({ itemId: r.itemId, user: item.userId, balance: r.account?.balance ?? null, moved: r.applied?.moved ?? 0, error: r.error || null });
  }
  return NextResponse.json({ synced: summary.length, summary });
}
