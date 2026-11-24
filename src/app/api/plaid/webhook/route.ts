import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncItem } from "@/lib/plaid-sync";

export const maxDuration = 60;

// Plaid calls this when an item needs attention or has new transactions.
// We only ever react by marking status or running a sync for that one item;
// the payload itself is never trusted for amounts.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const type: string = body.webhook_type || "";
  const code: string = body.webhook_code || "";
  const itemId: string = body.item_id || "";
  if (!itemId) return NextResponse.json({ ok: true });
  const item = await prisma.plaidItem.findUnique({ where: { itemId } });
  if (!item) return NextResponse.json({ ok: true });

  if (type === "ITEM") {
    if (code === "ERROR" || code === "PENDING_EXPIRATION" || code === "LOGIN_REPAIRED") {
      const err = body.error?.error_code || "";
      const status = code === "LOGIN_REPAIRED" ? "ok" : err === "ITEM_LOGIN_REQUIRED" || code === "PENDING_EXPIRATION" ? "login_required" : "error";
      await prisma.plaidItem.update({ where: { id: item.id }, data: { status, lastError: code === "LOGIN_REPAIRED" ? "" : `${err} ${body.error?.error_message || code}`.trim() } });
    }
    if (code === "USER_PERMISSION_REVOKED") {
      await prisma.plaidItem.delete({ where: { id: item.id } });
    }
  } else if (type === "TRANSACTIONS" && (code === "SYNC_UPDATES_AVAILABLE" || code === "DEFAULT_UPDATE" || code === "INITIAL_UPDATE")) {
    await syncItem(item, { apply: true });
  }
  return NextResponse.json({ ok: true });
}
