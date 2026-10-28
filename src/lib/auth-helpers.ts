import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";

// Signed-out requests: in production there is no anonymous account, so refuse
// rather than read or write a shared "default" bucket. Local dev keeps the
// "default" user because Clerk's production keys do not load on localhost.
export async function resolveUserId(clerkId: string | null): Promise<string> {
  if (!clerkId) {
    if (process.env.NODE_ENV === "production") throw new Error("Not signed in");
    return "default";
  }
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
