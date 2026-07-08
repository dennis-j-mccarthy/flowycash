import { config } from "dotenv";
config({ path: ".env.production" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DIRECT_DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const grouped = await prisma.transaction.groupBy({
    by: ["userId"],
    _count: { _all: true },
  });
  console.log("\nTransaction counts by userId:");
  grouped
    .sort((a, b) => b._count._all - a._count._all)
    .forEach((g) => {
      console.log(`  ${g.userId.padEnd(45)} ${g._count._all} txns`);
    });

  const shared = await prisma.sharedAccess.findMany();
  console.log("\nSharedAccess rows:");
  shared.forEach((s) => {
    console.log(`  owner=${s.ownerUserId}  shared_with=${s.sharedEmail}`);
  });

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
