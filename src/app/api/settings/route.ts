import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: { startingBalance: body.startingBalance },
    create: { id: "default", startingBalance: body.startingBalance },
  });
  return NextResponse.json(settings);
}
