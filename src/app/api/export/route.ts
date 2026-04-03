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

    const backup = {
      exportedAt: new Date().toISOString(),
      version: 1,
      settings: { startingBalance: settings?.startingBalance ?? 0 },
      transactions,
      overrides,
      balanceResets,
    };

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="flowycash-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    console.error("GET /api/export error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
