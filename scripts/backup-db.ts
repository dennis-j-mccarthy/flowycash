import { config } from "dotenv";
const envFile = process.argv[2] || ".env";
config({ path: envFile });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync } from "fs";

const adapter = new PrismaPg(process.env.DIRECT_DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const data = {
    transactions: await prisma.transaction.findMany(),
    overrides: await prisma.override.findMany(),
    balanceResets: await prisma.balanceReset.findMany(),
    settings: await prisma.settings.findMany(),
    sharedAccess: await prisma.sharedAccess.findMany(),
    monthNotes: await prisma.monthNote.findMany(),
  };
  const label = envFile === ".env.production" ? "prod" : "local";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `backups/pre-reminders-${label}-${stamp}.json`;
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`Wrote ${path}`);
  console.log(`  transactions: ${data.transactions.length}, overrides: ${data.overrides.length}, balanceResets: ${data.balanceResets.length}, settings: ${data.settings.length}, sharedAccess: ${data.sharedAccess.length}, monthNotes: ${data.monthNotes.length}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
