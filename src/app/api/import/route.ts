import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { NextRequest, NextResponse } from "next/server";

// Restore replaces the caller's own data only. Transactions get fresh ids so a
// backup from another account can never collide with existing rows; overrides
// follow their transaction through an id map.
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    const userId = await resolveUserId(clerkId);
    const backup = await req.json();
    if (!Array.isArray(backup.transactions) || !backup.version) {
      return NextResponse.json({ error: "Invalid backup format" }, { status: 400 });
    }

    const idMap = new Map<string, string>();

    await prisma.$transaction(async (db) => {
      // Clear this account's data. Overrides cascade from their transactions.
      await db.balanceReset.deleteMany({ where: { userId } });
      await db.transaction.deleteMany({ where: { userId } });
      await db.monthNote.deleteMany({ where: { userId } });

      await db.settings.upsert({
        where: { userId },
        update: { startingBalance: backup.settings?.startingBalance ?? 0 },
        create: { id: userId, userId, startingBalance: backup.settings?.startingBalance ?? 0 },
      });

      for (const tx of backup.transactions) {
        const created = await db.transaction.create({
          data: {
            userId,
            name: tx.name,
            amount: tx.amount,
            type: tx.type,
            recurrence: tx.recurrence || "none",
            startDate: tx.startDate,
            endDate: tx.endDate ?? null,
            autopay: tx.autopay ?? false,
            reminder: tx.reminder ?? false,
            tags: tx.tags ?? "",
            highlight: tx.highlight ?? "",
            note: tx.note ?? "",
          },
        });
        if (tx.id) idMap.set(tx.id, created.id);
      }

      for (const ov of backup.overrides || []) {
        const transactionId = idMap.get(ov.transactionId);
        if (!transactionId) continue;
        await db.override.create({
          data: {
            transactionId,
            occurrenceDate: ov.occurrenceDate,
            name: ov.name,
            amount: ov.amount,
            type: ov.type,
            deleted: ov.deleted ?? false,
            movedTo: ov.movedTo,
          },
        });
      }

      for (const br of backup.balanceResets || []) {
        await db.balanceReset.create({ data: { userId, date: br.date, amount: br.amount } });
      }

      for (const n of backup.monthNotes || []) {
        if (!n.month || !n.note) continue;
        await db.monthNote.create({ data: { userId, month: n.month, note: n.note } });
      }
    });

    return NextResponse.json({ ok: true, transactions: backup.transactions.length, overrides: (backup.overrides || []).length });
  } catch (e) {
    console.error("POST /api/import error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
