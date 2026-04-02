import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [transactions, overrides, balanceResets, settings] = await Promise.all([
      prisma.transaction.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.override.findMany(),
      prisma.balanceReset.findMany(),
      prisma.settings.findFirst({ where: { id: "default" } }),
    ]);

    const overridesMap: Record<string, (typeof overrides)[number]> = {};
    overrides.forEach((o) => {
      overridesMap[`${o.transactionId}::${o.occurrenceDate}`] = o;
    });

    const resetsMap: Record<string, number> = {};
    balanceResets.forEach((r) => {
      resetsMap[r.date] = r.amount;
    });

    return NextResponse.json({
      transactions,
      overrides: overridesMap,
      balanceResets: resetsMap,
      startingBalance: settings?.startingBalance ?? 0,
    });
  } catch (e) {
    console.error("GET /api/state error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
