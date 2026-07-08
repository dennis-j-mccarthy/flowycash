import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    const userId = await resolveUserId(clerkId);
    if (userId === "default") {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const body = await req.json();
    const { endpoint, keys } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/push/subscribe error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
