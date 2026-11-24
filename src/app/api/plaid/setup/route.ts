import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ONE-TIME, TEMPORARY. Creates the PlaidItem table in production so the
// Plaid routes work, because the production connection string is sealed in
// Vercel and cannot be pulled for a local `prisma db push`. Fixed DDL only,
// idempotent, signed-in users only. Remove after the first successful call.
const DDL = [
  `CREATE TABLE IF NOT EXISTS "PlaidItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL DEFAULT '',
    "institutionName" TEXT NOT NULL DEFAULT '',
    "trackedAccountId" TEXT,
    "trackedName" TEXT NOT NULL DEFAULT '',
    "trackedMask" TEXT NOT NULL DEFAULT '',
    "cursor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "lastError" TEXT NOT NULL DEFAULT '',
    "lastSyncedAt" TIMESTAMP(3),
    "lastBalance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlaidItem_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PlaidItem_itemId_key" ON "PlaidItem"("itemId")`,
  `CREATE INDEX IF NOT EXISTS "PlaidItem_userId_idx" ON "PlaidItem"("userId")`,
];

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  for (const sql of DDL) await prisma.$executeRawUnsafe(sql);
  const count = await prisma.plaidItem.count();
  return NextResponse.json({ ok: true, plaidItems: count });
}
