import { prisma } from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// GET: list who I'm sharing with
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const shares = await prisma.sharedAccess.findMany({ where: { ownerUserId: userId } });
    return NextResponse.json(shares);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST: invite someone by email
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    const share = await prisma.sharedAccess.upsert({
      where: { ownerUserId_sharedEmail: { ownerUserId: userId, sharedEmail: email.toLowerCase().trim() } },
      update: {},
      create: { ownerUserId: userId, sharedEmail: email.toLowerCase().trim() },
    });
    return NextResponse.json(share);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE: remove sharing
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { email } = await req.json();
    await prisma.sharedAccess.deleteMany({ where: { ownerUserId: userId, sharedEmail: email.toLowerCase().trim() } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
