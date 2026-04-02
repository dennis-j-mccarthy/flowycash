import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const reset = await prisma.balanceReset.upsert({
    where: { date: body.date },
    update: { amount: body.amount },
    create: { date: body.date, amount: body.amount },
  });
  return NextResponse.json(reset);
}
