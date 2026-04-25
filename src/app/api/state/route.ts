import { prisma } from "@/lib/prisma";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    let userId = clerkId || "default";

    // Check if this user has shared access to someone else's data
    // Only check for users who have no transactions of their own
    if (clerkId) {
      const ownTxCount = await prisma.transaction.count({ where: { userId: clerkId } });
      if (ownTxCount === 0) {
        // Look up user's email from Clerk to check shared access
        try {
          const client = await clerkClient();
          const user = await client.users.getUser(clerkId);
          const email = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
          if (email) {
            const sharedAccess = await prisma.sharedAccess.findFirst({ where: { sharedEmail: email } });
            if (sharedAccess) {
              userId = sharedAccess.ownerUserId;
            }
          }
        } catch { /* ignore clerk errors */ }
      }
    }

    // If signed in user has no data, check if "default" data exists and claim it
    if (clerkId && userId === clerkId) {
      const userTxCount = await prisma.transaction.count({ where: { userId } });
      if (userTxCount === 0) {
        const defaultTxCount = await prisma.transaction.count({ where: { userId: "default" } });
        if (defaultTxCount > 0) {
          // Claim default data for this user
          await Promise.all([
            prisma.transaction.updateMany({ where: { userId: "default" }, data: { userId } }),
            prisma.balanceReset.updateMany({ where: { userId: "default" }, data: { userId } }),
            prisma.monthNote.updateMany({ where: { userId: "default" }, data: { userId } }),
          ]);
          // Update settings - need to handle the unique constraint
          const defaultSettings = await prisma.settings.findFirst({ where: { userId: "default" } });
          if (defaultSettings) {
            await prisma.settings.upsert({
              where: { userId },
              update: { startingBalance: defaultSettings.startingBalance },
              create: { id: userId, userId, startingBalance: defaultSettings.startingBalance },
            });
            await prisma.settings.deleteMany({ where: { userId: "default" } });
          }
          console.log(`Claimed default data for user ${userId}`);
        }
      }
    }

    const [transactions, overrides, balanceResets, settings, monthNotes] = await Promise.all([
      prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.override.findMany({ where: { transaction: { userId } } }),
      prisma.balanceReset.findMany({ where: { userId } }),
      prisma.settings.findFirst({ where: { userId } }),
      prisma.monthNote.findMany({ where: { userId } }),
    ]);

    const overridesMap: Record<string, (typeof overrides)[number]> = {};
    overrides.forEach((o) => {
      overridesMap[`${o.transactionId}::${o.occurrenceDate}`] = o;
    });

    const resetsMap: Record<string, number> = {};
    balanceResets.forEach((r) => {
      resetsMap[r.date] = r.amount;
    });

    const notesMap: Record<string, string> = {};
    monthNotes.forEach((n) => { notesMap[n.month] = n.note; });

    return NextResponse.json({
      transactions,
      overrides: overridesMap,
      balanceResets: resetsMap,
      startingBalance: settings?.startingBalance ?? 0,
      monthNotes: notesMap,
    });
  } catch (e) {
    console.error("GET /api/state error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
