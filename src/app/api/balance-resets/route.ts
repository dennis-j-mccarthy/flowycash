import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId: clerkId } = await auth();
  const userId = await resolveUserId(clerkId);
  const reset = await prisma.balanceReset.upsert({
    where: { userId_date: { userId, date: body.date } },
    update: { amount: body.amount },
    create: { date: body.date, amount: body.amount, userId },
  });
  return NextResponse.json(reset);
}
