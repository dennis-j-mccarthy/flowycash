import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.amount !== undefined) data.amount = body.amount;
  if (body.type !== undefined) data.type = body.type;
  if (body.startDate !== undefined) data.startDate = body.startDate;
  if (body.recurrence !== undefined) data.recurrence = body.recurrence;
  const tx = await prisma.transaction.update({
    where: { id },
    data,
  });
  return NextResponse.json(tx);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.transaction.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
