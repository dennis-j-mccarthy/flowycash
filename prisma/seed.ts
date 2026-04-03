import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const DIRECT_URL = "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable";
const adapter = new PrismaPg(DIRECT_URL);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clear existing data
  await prisma.override.deleteMany();
  await prisma.balanceReset.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.settings.deleteMany();

  // Starting balance doesn't matter much before Apr 2 since we have a balance reset.
  await prisma.settings.create({
    data: { id: "default", startingBalance: 335.71 },
  });

  // Balance reset on Apr 2
  await prisma.balanceReset.create({
    data: { date: "2026-04-02", amount: 6045.00 },
  });

  // ============================================
  // RECURRING TRANSACTIONS
  // ============================================

  // Ave Bi-Weekly — amounts vary per month so 1st is one-time each
  await prisma.transaction.create({
    data: { name: "Ave Bi-Weekly", amount: 4500, type: "income", recurrence: "none", startDate: "2026-04-01" },
  });
  await prisma.transaction.create({
    data: { name: "Ave Bi-Weekly", amount: 4500, type: "income", recurrence: "none", startDate: "2026-05-01" },
  });
  // Mid-month: Apr 17 one-off, then monthly from May 15
  await prisma.transaction.create({
    data: { name: "Ave Bi-Weekly", amount: 4500, type: "income", recurrence: "none", startDate: "2026-04-17" },
  });
  await prisma.transaction.create({
    data: { name: "Ave Bi-Weekly", amount: 4500, type: "income", recurrence: "monthly", startDate: "2026-05-15" },
  });
  // 29th (May only)
  await prisma.transaction.create({
    data: { name: "Ave Bi-Weekly", amount: 4500, type: "income", recurrence: "none", startDate: "2026-05-29" },
  });

  // Ave Stipend — amounts vary per month so 1st is one-time each
  await prisma.transaction.create({
    data: { name: "Ave Stipend", amount: 1400, type: "income", recurrence: "none", startDate: "2026-04-01" },
  });
  await prisma.transaction.create({
    data: { name: "Ave Stipend", amount: 1300, type: "income", recurrence: "none", startDate: "2026-05-01" },
  });
  // Mid-month: Apr 17 one-off, then monthly from May 15
  await prisma.transaction.create({
    data: { name: "Ave Stipend", amount: 1300, type: "income", recurrence: "none", startDate: "2026-04-17" },
  });
  await prisma.transaction.create({
    data: { name: "Ave Stipend", amount: 1300, type: "income", recurrence: "monthly", startDate: "2026-05-15" },
  });
  // 29th (May only)
  await prisma.transaction.create({
    data: { name: "Ave Stipend", amount: 1300, type: "income", recurrence: "none", startDate: "2026-05-29" },
  });

  // Beth 2k repay
  await prisma.transaction.create({
    data: { name: "Beth 2k repay", amount: 1000, type: "income", recurrence: "none", startDate: "2026-05-01" },
  });
  await prisma.transaction.create({
    data: { name: "Beth 2k repay", amount: 1000, type: "expense", recurrence: "none", startDate: "2026-05-02" },
  });
  await prisma.transaction.create({
    data: { name: "Beth 2k repay", amount: 1000, type: "expense", recurrence: "none", startDate: "2026-05-29" },
  });

  // EXPENSES - Weekly (every Monday) — discretionary, NOT autopay
  await prisma.transaction.create({
    data: { name: "Beth Spending", amount: 40, type: "expense", recurrence: "weekly", startDate: "2026-03-30" },
  });
  await prisma.transaction.create({
    data: { name: "Cash Out", amount: 500, type: "expense", recurrence: "weekly", startDate: "2026-03-30" },
  });
  await prisma.transaction.create({
    data: { name: "Den spending", amount: 40, type: "expense", recurrence: "weekly", startDate: "2026-03-30" },
  });
  await prisma.transaction.create({
    data: { name: "Gas Den and B", amount: 55, type: "expense", recurrence: "weekly", startDate: "2026-03-30" },
  });
  await prisma.transaction.create({
    data: { name: "Wine and Booze", amount: 100, type: "expense", recurrence: "weekly", startDate: "2026-03-30" },
  });

  // EXPENSES - Weekly (every Saturday)
  await prisma.transaction.create({
    data: { name: "Amber Pet Care", amount: 200, type: "expense", recurrence: "weekly", startDate: "2026-04-04" },
  });

  // Bella Rent — NOT autopay (manual payment)
  await prisma.transaction.create({
    data: { name: "Bella Rent", amount: 2600, type: "expense", recurrence: "none", startDate: "2026-04-01" },
  });
  await prisma.transaction.create({
    data: { name: "Bella Rent", amount: 2650, type: "expense", recurrence: "none", startDate: "2026-05-01" },
  });

  // Chase Freedom — autopay
  await prisma.transaction.create({
    data: { name: "Chase Freedom", amount: 40, type: "expense", recurrence: "monthly", startDate: "2026-04-01", autopay: true },
  });

  // Florida Power — autopay utility
  await prisma.transaction.create({
    data: { name: "Florida Power", amount: 70, type: "expense", recurrence: "none", startDate: "2026-04-01", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "NEW RENT", amount: 2600, type: "income", recurrence: "none", startDate: "2026-04-01" },
  });
  await prisma.transaction.create({
    data: { name: "Florida Power", amount: 70, type: "expense", recurrence: "none", startDate: "2026-04-30", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "NEW RENT", amount: 2600, type: "income", recurrence: "none", startDate: "2026-04-30" },
  });

  // Black Hills Energy, Century Link — autopay utilities
  await prisma.transaction.create({
    data: { name: "Black Hills Energy", amount: 15, type: "expense", recurrence: "none", startDate: "2026-04-03", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Century Link", amount: 64.77, type: "expense", recurrence: "none", startDate: "2026-04-03", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Black Hills Energy", amount: 15, type: "expense", recurrence: "none", startDate: "2026-05-02", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Century Link", amount: 64.77, type: "expense", recurrence: "none", startDate: "2026-05-02", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Face foundarie", amount: 0, type: "expense", recurrence: "none", startDate: "2026-04-03" },
  });
  await prisma.transaction.create({
    data: { name: "Face foundarie", amount: 90, type: "expense", recurrence: "none", startDate: "2026-05-02" },
  });

  // Pet Best Insurance — autopay
  await prisma.transaction.create({
    data: { name: "Pet Best Insurance", amount: 76, type: "expense", recurrence: "monthly", startDate: "2026-04-06", autopay: true },
  });
  // Pocketsmith, Web Flow — autopay subscriptions
  await prisma.transaction.create({
    data: { name: "Pocketsmith", amount: 14.95, type: "expense", recurrence: "monthly", startDate: "2026-04-06", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Web Flow", amount: 24, type: "expense", recurrence: "monthly", startDate: "2026-04-06", autopay: true },
  });

  // Mercury Card, VERIZON — autopay
  await prisma.transaction.create({
    data: { name: "Mercury Card", amount: 195, type: "expense", recurrence: "monthly", startDate: "2026-04-07", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "VERIZON", amount: 265, type: "expense", recurrence: "monthly", startDate: "2026-04-07", autopay: true },
  });

  // Geico, Life Insurance — autopay
  await prisma.transaction.create({
    data: { name: "Geico", amount: 203, type: "expense", recurrence: "monthly", startDate: "2026-04-12", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Life Insurance", amount: 282, type: "expense", recurrence: "monthly", startDate: "2026-04-12", autopay: true },
  });

  // Claud AI — autopay subscription
  await prisma.transaction.create({
    data: { name: "Claud AI", amount: 20, type: "expense", recurrence: "monthly", startDate: "2026-04-13", autopay: true },
  });
  // Den Capital One — autopay credit card
  await prisma.transaction.create({
    data: { name: "Den Capital One", amount: 146, type: "expense", recurrence: "monthly", startDate: "2026-04-13", autopay: true },
  });

  // Amazon Prime, Beth Capitol One, Mailchimp, Mattress Firm — autopay
  await prisma.transaction.create({
    data: { name: "Amazon Prime", amount: 15, type: "expense", recurrence: "monthly", startDate: "2026-04-14", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Beth Capitol One", amount: 105, type: "expense", recurrence: "monthly", startDate: "2026-04-14", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Mailchimp", amount: 20, type: "expense", recurrence: "monthly", startDate: "2026-04-14", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Mattress Firm", amount: 113, type: "expense", recurrence: "monthly", startDate: "2026-04-14", autopay: true },
  });

  // Home Depot, Hostgator, Mid Journey, syncrony bank — autopay
  await prisma.transaction.create({
    data: { name: "Home Depot", amount: 60, type: "expense", recurrence: "monthly", startDate: "2026-04-15", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Hostgator", amount: 100, type: "expense", recurrence: "monthly", startDate: "2026-04-15", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Mid Journey", amount: 10, type: "expense", recurrence: "monthly", startDate: "2026-04-15", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "syncrony bank", amount: 110, type: "expense", recurrence: "monthly", startDate: "2026-04-15", autopay: true },
  });

  // Mortgage — NOT autopay (can be moved reluctantly)
  await prisma.transaction.create({
    data: { name: "Mortgage", amount: 2550, type: "expense", recurrence: "none", startDate: "2026-04-17" },
  });
  await prisma.transaction.create({
    data: { name: "Mortgage", amount: 2550, type: "expense", recurrence: "monthly", startDate: "2026-05-15" },
  });

  // Chewy for Arw — autopay
  await prisma.transaction.create({
    data: { name: "Chewy for Arw", amount: 41.98, type: "expense", recurrence: "monthly", startDate: "2026-04-16", autopay: true },
  });

  // Express Wash — autopay
  await prisma.transaction.create({
    data: { name: "Express Wash f", amount: 20.29, type: "expense", recurrence: "monthly", startDate: "2026-04-22", autopay: true },
  });

  // Comcast — autopay
  await prisma.transaction.create({
    data: { name: "Comcast", amount: 65, type: "expense", recurrence: "monthly", startDate: "2026-04-23", autopay: true },
  });

  // Hostgator (26th), Prime Video, The Hartford — autopay
  await prisma.transaction.create({
    data: { name: "Hostgator (26th)", amount: 16, type: "expense", recurrence: "monthly", startDate: "2026-03-26", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Prime Video", amount: 11.28, type: "expense", recurrence: "monthly", startDate: "2026-03-26", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "The Hartford Insurance", amount: 26, type: "expense", recurrence: "monthly", startDate: "2026-03-26", autopay: true },
  });

  // pay summit, Vimeo — autopay
  await prisma.transaction.create({
    data: { name: "pay summit and...", amount: 28, type: "expense", recurrence: "monthly", startDate: "2026-03-27", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Vimeo", amount: 12, type: "expense", recurrence: "monthly", startDate: "2026-03-27", autopay: true },
  });

  // Hulu, State Farm — autopay
  await prisma.transaction.create({
    data: { name: "Hulu", amount: 110, type: "expense", recurrence: "monthly", startDate: "2026-03-28", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "State Farm Homeowners", amount: 69, type: "expense", recurrence: "monthly", startDate: "2026-03-28", autopay: true },
  });

  // Netflix — autopay
  await prisma.transaction.create({
    data: { name: "Netflix", amount: 19.99, type: "expense", recurrence: "monthly", startDate: "2026-03-30", autopay: true },
  });

  // ============================================
  // ONE-TIME TRANSACTIONS (not autopay unless noted)
  // ============================================

  await prisma.transaction.create({
    data: { name: "Bob Castellino", amount: 500, type: "expense", recurrence: "none", startDate: "2026-03-30" },
  });

  // Apr 4
  await prisma.transaction.create({
    data: { name: "amber last week", amount: 225, type: "expense", recurrence: "none", startDate: "2026-04-04" },
  });
  await prisma.transaction.create({
    data: { name: "Beth debt", amount: 333, type: "expense", recurrence: "none", startDate: "2026-04-04" },
  });

  // Apr 9
  await prisma.transaction.create({
    data: { name: "Attitude Credit", amount: 299, type: "expense", recurrence: "none", startDate: "2026-04-09" },
  });
  await prisma.transaction.create({
    data: { name: "Beth debt", amount: 333, type: "expense", recurrence: "none", startDate: "2026-04-09" },
  });
  await prisma.transaction.create({
    data: { name: "Den Honda", amount: 700, type: "expense", recurrence: "none", startDate: "2026-04-09" },
  });

  // Monthly on the 11th
  await prisma.transaction.create({
    data: { name: "Express Toll and...", amount: 30, type: "expense", recurrence: "monthly", startDate: "2026-04-11", autopay: true },
  });
  await prisma.transaction.create({
    data: { name: "Open AI", amount: 20, type: "expense", recurrence: "monthly", startDate: "2026-04-11", autopay: true },
  });

  // wayfair — autopay
  await prisma.transaction.create({
    data: { name: "wayfair", amount: 36, type: "expense", recurrence: "monthly", startDate: "2026-04-12", autopay: true },
  });

  // Monthly on the 17th — NOT autopay (manual payments)
  await prisma.transaction.create({
    data: { name: "Brightway credit", amount: 41, type: "expense", recurrence: "monthly", startDate: "2026-04-17" },
  });
  await prisma.transaction.create({
    data: { name: "Honda Beth", amount: 691, type: "expense", recurrence: "none", startDate: "2026-04-17" },
  });
  await prisma.transaction.create({
    data: { name: "Mission Credit", amount: 50, type: "expense", recurrence: "monthly", startDate: "2026-04-17" },
  });
  await prisma.transaction.create({
    data: { name: "Supplements", amount: 120, type: "expense", recurrence: "monthly", startDate: "2026-04-17" },
  });
  await prisma.transaction.create({
    data: { name: "US Bank Mastercard", amount: 40.73, type: "expense", recurrence: "monthly", startDate: "2026-04-17" },
  });

  // Monthly on the 25th — NOT autopay
  await prisma.transaction.create({
    data: { name: "ENT", amount: 450, type: "expense", recurrence: "monthly", startDate: "2026-04-25" },
  });
  await prisma.transaction.create({
    data: { name: "Mountain View", amount: 0, type: "expense", recurrence: "monthly", startDate: "2026-04-25" },
  });
  await prisma.transaction.create({
    data: { name: "Triview Metro", amount: 0, type: "expense", recurrence: "monthly", startDate: "2026-04-25" },
  });
  await prisma.transaction.create({
    data: { name: "Webflow", amount: 20, type: "expense", recurrence: "monthly", startDate: "2026-04-25" },
  });

  // May one-time
  await prisma.transaction.create({
    data: { name: "Vanessa 2 of 3", amount: 500, type: "expense", recurrence: "none", startDate: "2026-05-01" },
  });
  await prisma.transaction.create({
    data: { name: "You Tube", amount: 78.98, type: "expense", recurrence: "none", startDate: "2026-05-03", autopay: true },
  });

  // May 10
  await prisma.transaction.create({
    data: { name: "Attitude Credit", amount: 299, type: "expense", recurrence: "none", startDate: "2026-05-10" },
  });
  await prisma.transaction.create({
    data: { name: "Beth Honda", amount: 691, type: "expense", recurrence: "none", startDate: "2026-05-10" },
  });
  await prisma.transaction.create({
    data: { name: "Den Honda", amount: 500, type: "expense", recurrence: "none", startDate: "2026-05-10" },
  });

  // Monthly on 11th, 17th, 25th — covered by recurring from April

  // ============================================
  // TAGS — batch update by name pattern
  // ============================================
  const tagMap: Record<string, string> = {
    "Ave Bi-Weekly": "income",
    "Ave Stipend": "income",
    "Beth 2k repay": "debt",
    "NEW RENT": "rent-income",
    "Beth Spending": "allowance",
    "Cash Out": "allowance",
    "Den spending": "allowance",
    "Gas Den and B": "auto,gas",
    "Wine and Booze": "liquor",
    "Amber Pet Care": "pets",
    "Bella Rent": "housing",
    "Chase Freedom": "debt",
    "Florida Power": "utilities",
    "Black Hills Energy": "utilities",
    "Century Link": "utilities",
    "Face foundarie": "personal",
    "Pet Best Insurance": "pets,insurance",
    "Pocketsmith": "subscriptions",
    "Web Flow": "subscriptions",
    "Mercury Card": "debt",
    "VERIZON": "utilities",
    "Geico": "auto,insurance",
    "Life Insurance": "insurance",
    "Claud AI": "subscriptions",
    "Den Capital One": "debt",
    "Amazon Prime": "subscriptions",
    "Beth Capitol One": "debt",
    "Mailchimp": "subscriptions",
    "Mattress Firm": "debt",
    "Home Depot": "debt",
    "Hostgator": "subscriptions",
    "Mid Journey": "subscriptions",
    "Mortgage": "housing",
    "syncrony bank": "debt",
    "Chewy for Arw": "pets",
    "Express Wash f": "auto",
    "Comcast": "utilities",
    "Hostgator (26th)": "subscriptions",
    "Prime Video": "subscriptions",
    "The Hartford Insurance": "insurance",
    "pay summit and...": "subscriptions",
    "Vimeo": "subscriptions",
    "Hulu": "subscriptions",
    "State Farm Homeowners": "housing,insurance",
    "Netflix": "subscriptions",
    "Bob Castellino": "personal",
    "amber last week": "pets",
    "Beth debt": "loan",
    "Attitude Credit": "debt",
    "Den Honda": "auto",
    "Express Toll and...": "auto,tolls",
    "Open AI": "subscriptions",
    "wayfair": "debt",
    "Brightway credit": "debt",
    "Honda Beth": "auto",
    "Mission Credit": "debt",
    "Supplements": "health",
    "US Bank Mastercard": "debt",
    "ENT": "debt",
    "Mountain View": "utilities",
    "Triview Metro": "utilities",
    "Webflow": "subscriptions",
    "Vanessa 2 of 3": "personal",
    "You Tube": "subscriptions",
    "Beth Honda": "auto",
  };

  for (const [name, tags] of Object.entries(tagMap)) {
    await prisma.transaction.updateMany({ where: { name }, data: { tags } });
  }

  console.log("Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
