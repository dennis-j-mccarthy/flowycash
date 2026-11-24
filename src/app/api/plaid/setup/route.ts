import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ONE-TIME, TEMPORARY. Adds the lastUnknown column to PlaidItem in production
// (the connection string is sealed in Vercel, so no local `prisma db push`).
// Fixed DDL only, idempotent, signed-in users only. Removed after it has run.
const DDL = [
  `ALTER TABLE "PlaidItem" ADD COLUMN IF NOT EXISTS "lastUnknown" TEXT NOT NULL DEFAULT '[]'`,
];

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  for (const sql of DDL) await prisma.$executeRawUnsafe(sql);
  const count = await prisma.plaidItem.count();
  return NextResponse.json({ ok: true, plaidItems: count });
}
