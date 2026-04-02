import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
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
}
