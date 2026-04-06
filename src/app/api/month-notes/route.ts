import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const { userId: clerkId } = await auth();
  const userId = clerkId || "default";
  const notes = await prisma.monthNote.findMany({ where: { userId } });
  const map: Record<string, string> = {};
  notes.forEach((n) => { map[n.month] = n.note; });
  return NextResponse.json(map);
}

export async function POST(req: NextRequest) {
  const { month, note } = await req.json();
  const { userId: clerkId } = await auth();
  const userId = clerkId || "default";
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });
  if (!note || !note.trim()) {
    await prisma.monthNote.deleteMany({ where: { month, userId } });
    return NextResponse.json({ ok: true });
  }
  await prisma.monthNote.upsert({
    where: { userId_month: { userId, month } },
    update: { note },
    create: { month, note, userId },
  });
  return NextResponse.json({ ok: true });
}
