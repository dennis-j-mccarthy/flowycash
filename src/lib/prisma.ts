import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: InstanceType<typeof PrismaClient> };

function createClient() {
  const adapter = new PrismaPg(process.env.DIRECT_DATABASE_URL!);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * The creator page (/admin) checks this before every query so its routes
 * answer with a sentence instead of a 500 when the runtime connection
 * string is missing.
 */
export function isDatabaseConfigured(): boolean {
  return !!process.env.DIRECT_DATABASE_URL;
}

/** The standard "no DB" message surfaced by the admin tools. */
export const DB_MISSING_MESSAGE =
  "Database not connected — set DIRECT_DATABASE_URL and run `npx prisma db push`.";
