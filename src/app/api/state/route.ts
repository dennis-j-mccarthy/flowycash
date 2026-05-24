import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    const userId = await resolveUserId(clerkId);

    const [transactions, overrides, balanceResets, settings, monthNotes] = await Promise.all([
      prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.override.findMany({ where: { transaction: { userId } } }),
      prisma.balanceReset.findMany({ where: { userId } }),
      prisma.settings.findFirst({ where: { userId } }),
      prisma.monthNote.findMany({ where: { userId } }),
    ]);

    const overridesMap: Record<string, (typeof overrides)[number]> = {};
    overrides.forEach((o) => {
      overridesMap[`${o.transactionId}::${o.occurrenceDate}`] = o;
    });

    const resetsMap: Record<string, number> = {};
    balanceResets.forEach((r) => {
      resetsMap[r.date] = r.amount;
    });

    const notesMap: Record<string, string> = {};
    monthNotes.forEach((n) => { notesMap[n.month] = n.note; });

    return NextResponse.json({
      transactions,
      overrides: overridesMap,
      balanceResets: resetsMap,
      startingBalance: settings?.startingBalance ?? 0,
      monthNotes: notesMap,
    });
  } catch (e) {
    console.error("GET /api/state error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
