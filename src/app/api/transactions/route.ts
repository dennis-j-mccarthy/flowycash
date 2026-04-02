import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const tx = await prisma.transaction.create({
    data: {
      name: body.name,
      amount: body.amount,
      type: body.type,
      recurrence: body.recurrence || "none",
      startDate: body.startDate,
    },
  });
  return NextResponse.json(tx, { status: 201 });
}
