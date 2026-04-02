import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params;
  await prisma.balanceReset.delete({ where: { date } });
  return NextResponse.json({ ok: true });
}
