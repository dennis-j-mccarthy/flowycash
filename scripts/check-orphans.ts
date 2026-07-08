import { config } from "dotenv";
config({ path: ".env.production" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DIRECT_DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const OWNER = "user_3DgzhD8gnHc98ZtWh6Bwm2X1rVn";

async function main() {
  console.log("\n== All BalanceReset rows ==");
  const resets = await prisma.balanceReset.findMany({ orderBy: { date: "desc" } });
  resets.forEach((r) => console.log(`  ${r.userId.padEnd(40)} ${r.date}  $${r.amount}`));

  console.log("\n== All distinct userIds across tables ==");
  const txUsers = await prisma.transaction.groupBy({ by: ["userId"], _count: { _all: true } });
  const resetUsers = await prisma.balanceReset.groupBy({ by: ["userId"], _count: { _all: true } });
  const settingsUsers = await prisma.settings.groupBy({ by: ["userId"], _count: { _all: true } });
  const noteUsers = await prisma.monthNote.groupBy({ by: ["userId"], _count: { _all: true } });
  console.log("  Transaction:");
  txUsers.forEach((g) => console.log(`    ${g.userId.padEnd(40)} ${g._count._all}`));
  console.log("  BalanceReset:");
  resetUsers.forEach((g) => console.log(`    ${g.userId.padEnd(40)} ${g._count._all}`));
  console.log("  Settings:");
  settingsUsers.forEach((g) => console.log(`    ${g.userId.padEnd(40)} ${g._count._all}`));
  console.log("  MonthNote:");
  noteUsers.forEach((g) => console.log(`    ${g.userId.padEnd(40)} ${g._count._all}`));

  console.log(`\nOwner is: ${OWNER}`);
  console.log("Rows under any OTHER userId may be wife's orphaned writes.\n");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
