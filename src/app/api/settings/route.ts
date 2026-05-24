import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { userId: clerkId } = await auth();
  const userId = await resolveUserId(clerkId);
  const settings = await prisma.settings.upsert({
    where: { userId },
    update: { startingBalance: body.startingBalance },
    create: { id: userId, userId, startingBalance: body.startingBalance },
  });
  return NextResponse.json(settings);
}
