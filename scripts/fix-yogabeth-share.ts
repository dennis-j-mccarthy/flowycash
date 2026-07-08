import { config } from "dotenv";
config({ path: ".env.production" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DIRECT_DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const OLD_OWNER = "user_3BrDIpzkDVH9nmMx0EB0JDeCSHQ";
const NEW_OWNER = "user_3DgzhD8gnHc98ZtWh6Bwm2X1rVn";
const EMAIL = "yogabeth@mac.com";

async function main() {
  const before = await prisma.sharedAccess.findMany({ where: { sharedEmail: EMAIL } });
  console.log("Before:", before);

  const result = await prisma.sharedAccess.updateMany({
    where: { sharedEmail: EMAIL, ownerUserId: OLD_OWNER },
    data: { ownerUserId: NEW_OWNER },
  });
  console.log(`Updated ${result.count} row(s)`);

  const after = await prisma.sharedAccess.findMany({ where: { sharedEmail: EMAIL } });
  console.log("After:", after);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
