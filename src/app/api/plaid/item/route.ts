import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { decryptToken, plaid, plaidConfigured, PLAID_ENV } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";

async function who() {
  const { userId: clerkId } = await auth();
  return resolveUserId(clerkId);
}

// GET: the user's linked banks and which account the calendar tracks.
export async function GET() {
  let userId: string;
  try { userId = await who(); } catch { return NextResponse.json({ error: "Not signed in" }, { status: 401 }); }
  const items = await prisma.plaidItem.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({
    configured: plaidConfigured(),
    env: PLAID_ENV,
    items: items.map((i) => ({
      itemId: i.itemId, institutionName: i.institutionName, status: i.status, lastError: i.lastError,
      trackedAccountId: i.trackedAccountId, trackedName: i.trackedName, trackedMask: i.trackedMask,
      lastSyncedAt: i.lastSyncedAt, lastBalance: i.lastBalance,
      unknown: (() => { try { return JSON.parse(i.lastUnknown || "[]"); } catch { return []; } })(),
    })),
  });
}

// PUT { itemId, accountId, name, mask }: choose the tracked account.
// PUT { itemId, clearUnknown: true }: empty the "not on your calendar" list.
export async function PUT(req: NextRequest) {
  let userId: string;
  try { userId = await who(); } catch { return NextResponse.json({ error: "Not signed in" }, { status: 401 }); }
  const body = await req.json().catch(() => ({}));
  const item = await prisma.plaidItem.findFirst({ where: { userId, itemId: body.itemId } });
  if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 404 });
  if (body.clearUnknown) {
    await prisma.plaidItem.update({ where: { id: item.id }, data: { lastUnknown: "[]" } });
    return NextResponse.json({ ok: true });
  }
  await prisma.plaidItem.update({
    where: { id: item.id },
    data: { trackedAccountId: body.accountId || null, trackedName: body.name || "", trackedMask: body.mask || "", cursor: null },
  });
  return NextResponse.json({ ok: true });
}

// DELETE { itemId }: disconnect at Plaid and forget the token.
export async function DELETE(req: NextRequest) {
  let userId: string;
  try { userId = await who(); } catch { return NextResponse.json({ error: "Not signed in" }, { status: 401 }); }
  const body = await req.json().catch(() => ({}));
  const item = await prisma.plaidItem.findFirst({ where: { userId, itemId: body.itemId } });
  if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 404 });
  try { await plaid().itemRemove({ access_token: decryptToken(item.accessToken) }); } catch { /* already gone at Plaid; still forget locally */ }
  await prisma.plaidItem.delete({ where: { id: item.id } });
  return NextResponse.json({ ok: true });
}
