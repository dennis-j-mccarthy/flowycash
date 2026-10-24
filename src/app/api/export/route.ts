import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { NextResponse } from "next/server";

// Backup of the caller's own data only.
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

    const backup = {
      exportedAt: new Date().toISOString(),
      version: 2,
      settings: { startingBalance: settings?.startingBalance ?? 0 },
      transactions,
      overrides,
      balanceResets,
      monthNotes: monthNotes.map((n) => ({ month: n.month, note: n.note })),
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
