import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId: clerkId } = await auth();
  const userId = await resolveUserId(clerkId);
  const tx = await prisma.transaction.create({
    data: {
      userId,
      name: body.name,
      amount: body.amount,
      type: body.type,
      recurrence: body.recurrence || "none",
      startDate: body.startDate,
      autopay: body.autopay ?? false,
      tags: body.tags ?? "",
      highlight: body.highlight ?? "",
      note: body.note ?? "",
    },
  });
  return NextResponse.json(tx, { status: 201 });
}
