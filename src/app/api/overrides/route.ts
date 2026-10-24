import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { NextRequest, NextResponse } from "next/server";

// An override hangs off a transaction, so the caller must own that transaction.
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    const userId = await resolveUserId(clerkId);
    const body = await req.json();
    const owned = await prisma.transaction.findFirst({ where: { id: body.transactionId, userId }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const override = await prisma.override.upsert({
      where: {
        transactionId_occurrenceDate: {
          transactionId: body.transactionId,
          occurrenceDate: body.occurrenceDate,
        },
      },
      update: {
        name: body.name ?? undefined,
        amount: body.amount ?? undefined,
        type: body.type ?? undefined,
        deleted: body.deleted ?? undefined,
        movedTo: body.movedTo ?? undefined,
      },
      create: {
        transactionId: body.transactionId,
        occurrenceDate: body.occurrenceDate,
        name: body.name,
        amount: body.amount,
        type: body.type,
        deleted: body.deleted ?? false,
        movedTo: body.movedTo,
      },
    });
    return NextResponse.json(override);
  } catch (e) {
    console.error("POST /api/overrides error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
