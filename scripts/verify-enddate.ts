import { config } from "dotenv";
config({ path: ".env.production" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DIRECT_DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const sample = await prisma.transaction.findFirst();
  console.log("Sample transaction fields:", sample ? Object.keys(sample) : "no rows");
  console.log("Sample endDate value:", sample?.endDate);

  const count = await prisma.transaction.count();
  const withEnd = await prisma.transaction.count({ where: { endDate: { not: null } } });
  console.log(`\nTotal transactions: ${count}`);
  console.log(`With endDate set: ${withEnd} (should be 0 — nothing has been capped yet)`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
