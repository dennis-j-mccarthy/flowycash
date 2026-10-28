import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { NextRequest, NextResponse } from "next/server";

// Every write is scoped to the caller's account: a transaction id that belongs
// to someone else is treated as not found.

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId: clerkId } = await auth();
    const userId = await resolveUserId(clerkId);
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.amount !== undefined) data.amount = body.amount;
    if (body.type !== undefined) data.type = body.type;
    if (body.startDate !== undefined) data.startDate = body.startDate;
    if (body.endDate !== undefined) data.endDate = body.endDate;
    if (body.recurrence !== undefined) data.recurrence = body.recurrence;
    if (body.autopay !== undefined) data.autopay = body.autopay;
    if (body.reminder !== undefined) data.reminder = body.reminder;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.highlight !== undefined) data.highlight = body.highlight;
    if (body.note !== undefined) data.note = body.note;
    const result = await prisma.transaction.updateMany({ where: { id, userId }, data });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const tx = await prisma.transaction.findUnique({ where: { id } });
    return NextResponse.json(tx);
  } catch (e) {
    console.error("PUT /api/transactions/[id] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId: clerkId } = await auth();
    const userId = await resolveUserId(clerkId);
    const result = await prisma.transaction.deleteMany({ where: { id, userId } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/transactions/[id] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
