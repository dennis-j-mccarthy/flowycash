import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const backup = await req.json();
    if (!backup.transactions || !backup.version) {
      return NextResponse.json({ error: "Invalid backup format" }, { status: 400 });
    }

    // Clear existing data
    await prisma.override.deleteMany();
    await prisma.balanceReset.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.settings.deleteMany();

    // Restore settings
    await prisma.settings.create({
      data: { id: "default", startingBalance: backup.settings?.startingBalance ?? 0 },
    });

    // Restore transactions
    for (const tx of backup.transactions) {
      await prisma.transaction.create({
        data: {
          id: tx.id,
          name: tx.name,
          amount: tx.amount,
          type: tx.type,
          recurrence: tx.recurrence || "none",
          startDate: tx.startDate,
          autopay: tx.autopay ?? false,
          tags: tx.tags ?? "",
          highlight: tx.highlight ?? "",
        },
      });
    }

    // Restore overrides
    for (const ov of backup.overrides || []) {
      await prisma.override.create({
        data: {
          transactionId: ov.transactionId,
          occurrenceDate: ov.occurrenceDate,
          name: ov.name,
          amount: ov.amount,
          type: ov.type,
          deleted: ov.deleted ?? false,
          movedTo: ov.movedTo,
        },
      });
    }

    // Restore balance resets
    for (const br of backup.balanceResets || []) {
      await prisma.balanceReset.create({
        data: {
          date: br.date,
          amount: br.amount,
        },
      });
    }

    return NextResponse.json({ ok: true, transactions: backup.transactions.length });
  } catch (e) {
    console.error("POST /api/import error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
