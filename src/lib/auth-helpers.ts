import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";

export async function resolveUserId(clerkId: string | null): Promise<string> {
  if (!clerkId) return "default";
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkId);
    const email = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
    if (email) {
      const sharedAccess = await prisma.sharedAccess.findFirst({ where: { sharedEmail: email } });
      if (sharedAccess) return sharedAccess.ownerUserId;
    }
  } catch { /* ignore clerk errors */ }
  return clerkId;
}
