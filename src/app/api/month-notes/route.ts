import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const notes = await prisma.monthNote.findMany();
  const map: Record<string, string> = {};
  notes.forEach((n) => { map[n.month] = n.note; });
  return NextResponse.json(map);
}

export async function POST(req: NextRequest) {
  const { month, note } = await req.json();
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });
  if (!note || !note.trim()) {
    await prisma.monthNote.deleteMany({ where: { month } });
    return NextResponse.json({ ok: true });
  }
  await prisma.monthNote.upsert({
    where: { month },
    update: { note },
    create: { month, note },
  });
  return NextResponse.json({ ok: true });
}
