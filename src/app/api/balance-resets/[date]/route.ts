import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params;
  const { userId: clerkId } = await auth();
  const userId = await resolveUserId(clerkId);
  await prisma.balanceReset.deleteMany({ where: { date, userId } });
  return NextResponse.json({ ok: true });
}
