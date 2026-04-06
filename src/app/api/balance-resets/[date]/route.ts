import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params;
  const { userId: clerkId } = await auth();
  const userId = clerkId || "default";
  await prisma.balanceReset.deleteMany({ where: { date, userId } });
  return NextResponse.json({ ok: true });
}
