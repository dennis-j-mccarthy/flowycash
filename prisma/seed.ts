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
  // Set it to 590.70 (visible on Mar 29 in the source app).
  await prisma.settings.create({
    data: { id: "default", startingBalance: 335.71 },
  });

  // Balance reset on Apr 2 — "Checking Balance" in source app snaps balance to $6,045.00
  await prisma.balanceReset.create({
    data: { date: "2026-04-02", amount: 6045.00 },
  });


  // ============================================
  // RECURRING TRANSACTIONS
  // ============================================

  // INCOME - Biweekly pay, amounts vary per occurrence
  // Apr 1: $4,500 / $1,400. Apr 15: $4,500 / $1,300. Apr 29: Beth 2k repay only.
  // May 1: $4,400 / $1,300. May 15: $4,500 / $1,300. May 29: $4,500 / $1,300 + Beth 2k repay.
  // Using monthly recurring with the most common values, plus one-time adjustments.

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

  // Beth 2k repay — May 1 income (matches balance), May 2 EXPENSE, May 29 income
  await prisma.transaction.create({
    data: { name: "Beth 2k repay", amount: 1000, type: "income", recurrence: "none", startDate: "2026-05-01" },
  });
  await prisma.transaction.create({
    data: { name: "Beth 2k repay", amount: 1000, type: "expense", recurrence: "none", startDate: "2026-05-02" },
  });
  await prisma.transaction.create({
    data: { name: "Beth 2k repay", amount: 1000, type: "expense", recurrence: "none", startDate: "2026-05-29" },
  });

  // EXPENSES - Weekly (every Monday)
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

  // EXPENSES - Monthly on the 1st
  // Bella Rent: $2,600 in April, $2,650 in May
  await prisma.transaction.create({
    data: { name: "Bella Rent", amount: 2600, type: "expense", recurrence: "none", startDate: "2026-04-01" },
  });
  await prisma.transaction.create({
    data: { name: "Bella Rent", amount: 2650, type: "expense", recurrence: "none", startDate: "2026-05-01" },
  });
  await prisma.transaction.create({
    data: { name: "Chase Freedom", amount: 40, type: "expense", recurrence: "monthly", startDate: "2026-04-01" },
  });

  // Florida Power and NEW RENT: appear on Apr 1 AND Apr 30, but NOT May 1
  // Treating as one-time entries to match exactly
  await prisma.transaction.create({
    data: { name: "Florida Power", amount: 70, type: "expense", recurrence: "none", startDate: "2026-04-01" },
  });
  await prisma.transaction.create({
    data: { name: "NEW RENT", amount: 2600, type: "income", recurrence: "none", startDate: "2026-04-01" },
  });
  await prisma.transaction.create({
    data: { name: "Florida Power", amount: 70, type: "expense", recurrence: "none", startDate: "2026-04-30" },
  });
  await prisma.transaction.create({
    data: { name: "NEW RENT", amount: 2600, type: "income", recurrence: "none", startDate: "2026-04-30" },
  });
  // Florida Power and NEW RENT do NOT appear in May 30 screenshot — removed

  // Monthly on the 3rd (Fri in April)
  await prisma.transaction.create({
    data: { name: "Black Hills Energy", amount: 15, type: "expense", recurrence: "none", startDate: "2026-04-03" },
  });
  await prisma.transaction.create({
    data: { name: "Century Link", amount: 64.77, type: "expense", recurrence: "none", startDate: "2026-04-03" },
  });
  // In May, these appear on the 2nd instead of 3rd
  await prisma.transaction.create({
    data: { name: "Black Hills Energy", amount: 15, type: "expense", recurrence: "none", startDate: "2026-05-02" },
  });
  await prisma.transaction.create({
    data: { name: "Century Link", amount: 64.77, type: "expense", recurrence: "none", startDate: "2026-05-02" },
  });
  await prisma.transaction.create({
    data: { name: "Face foundarie", amount: 0, type: "expense", recurrence: "none", startDate: "2026-04-03" },
  });
  await prisma.transaction.create({
    data: { name: "Face foundarie", amount: 90, type: "expense", recurrence: "none", startDate: "2026-05-02" },
  });

  // Monthly on the 6th
  await prisma.transaction.create({
    data: { name: "Pet Best Insurance", amount: 76, type: "expense", recurrence: "monthly", startDate: "2026-04-06" },
  });
  await prisma.transaction.create({
    data: { name: "Pocketsmith", amount: 14.95, type: "expense", recurrence: "monthly", startDate: "2026-04-06" },
  });
  await prisma.transaction.create({
    data: { name: "Web Flow", amount: 24, type: "expense", recurrence: "monthly", startDate: "2026-04-06" },
  });

  // Monthly on the 7th
  await prisma.transaction.create({
    data: { name: "Mercury Card", amount: 195, type: "expense", recurrence: "monthly", startDate: "2026-04-07" },
  });
  await prisma.transaction.create({
    data: { name: "VERIZON", amount: 265, type: "expense", recurrence: "monthly", startDate: "2026-04-07" },
  });

  // Monthly on the 12th
  await prisma.transaction.create({
    data: { name: "Geico", amount: 203, type: "expense", recurrence: "monthly", startDate: "2026-04-12" },
  });
  await prisma.transaction.create({
    data: { name: "Life Insurance", amount: 282, type: "expense", recurrence: "monthly", startDate: "2026-04-12" },
  });

  // Monthly on the 13th
  await prisma.transaction.create({
    data: { name: "Claud AI", amount: 20, type: "expense", recurrence: "monthly", startDate: "2026-04-13" },
  });
  await prisma.transaction.create({
    data: { name: "Den Capital One", amount: 146, type: "expense", recurrence: "monthly", startDate: "2026-04-13" },
  });

  // Monthly on the 14th
  await prisma.transaction.create({
    data: { name: "Amazon Prime", amount: 15, type: "expense", recurrence: "monthly", startDate: "2026-04-14" },
  });
  await prisma.transaction.create({
    data: { name: "Beth Capitol One", amount: 105, type: "expense", recurrence: "monthly", startDate: "2026-04-14" },
  });
  await prisma.transaction.create({
    data: { name: "Mailchimp", amount: 20, type: "expense", recurrence: "monthly", startDate: "2026-04-14" },
  });
  await prisma.transaction.create({
    data: { name: "Mattress Firm", amount: 113, type: "expense", recurrence: "monthly", startDate: "2026-04-14" },
  });

  // Monthly on the 15th
  await prisma.transaction.create({
    data: { name: "Home Depot", amount: 60, type: "expense", recurrence: "monthly", startDate: "2026-04-15" },
  });
  await prisma.transaction.create({
    data: { name: "Hostgator", amount: 100, type: "expense", recurrence: "monthly", startDate: "2026-04-15" },
  });
  await prisma.transaction.create({
    data: { name: "Mid Journey", amount: 10, type: "expense", recurrence: "monthly", startDate: "2026-04-15" },
  });
  // Mortgage — Apr 17, then 15th monthly from May onward
  await prisma.transaction.create({
    data: { name: "Mortgage", amount: 2550, type: "expense", recurrence: "none", startDate: "2026-04-17" },
  });
  await prisma.transaction.create({
    data: { name: "Mortgage", amount: 2550, type: "expense", recurrence: "monthly", startDate: "2026-05-15" },
  });
  await prisma.transaction.create({
    data: { name: "syncrony bank", amount: 110, type: "expense", recurrence: "monthly", startDate: "2026-04-15" },
  });

  // Monthly on the 16th
  await prisma.transaction.create({
    data: { name: "Chewy for Arw", amount: 41.98, type: "expense", recurrence: "monthly", startDate: "2026-04-16" },
  });

  // Monthly on the 22nd
  await prisma.transaction.create({
    data: { name: "Express Wash f", amount: 20.29, type: "expense", recurrence: "monthly", startDate: "2026-04-22" },
  });

  // Monthly on the 23rd
  await prisma.transaction.create({
    data: { name: "Comcast", amount: 65, type: "expense", recurrence: "monthly", startDate: "2026-04-23" },
  });

  // Monthly on the 26th
  await prisma.transaction.create({
    data: { name: "Hostgator (26th)", amount: 16, type: "expense", recurrence: "monthly", startDate: "2026-03-26" },
  });
  await prisma.transaction.create({
    data: { name: "Prime Video", amount: 11.28, type: "expense", recurrence: "monthly", startDate: "2026-03-26" },
  });
  await prisma.transaction.create({
    data: { name: "The Hartford Insurance", amount: 26, type: "expense", recurrence: "monthly", startDate: "2026-03-26" },
  });

  // Monthly on the 27th
  await prisma.transaction.create({
    data: { name: "pay summit and...", amount: 28, type: "expense", recurrence: "monthly", startDate: "2026-03-27" },
  });
  await prisma.transaction.create({
    data: { name: "Vimeo", amount: 12, type: "expense", recurrence: "monthly", startDate: "2026-03-27" },
  });

  // Monthly on the 28th
  await prisma.transaction.create({
    data: { name: "Hulu", amount: 110, type: "expense", recurrence: "monthly", startDate: "2026-03-28" },
  });
  await prisma.transaction.create({
    data: { name: "State Farm Homeowners", amount: 69, type: "expense", recurrence: "monthly", startDate: "2026-03-28" },
  });

  // Monthly on the 30th
  await prisma.transaction.create({
    data: { name: "Netflix", amount: 19.99, type: "expense", recurrence: "monthly", startDate: "2026-03-30" },
  });

  // ============================================
  // ONE-TIME TRANSACTIONS
  // ============================================

  // == Pre-April (visible in the April calendar view) ==
  await prisma.transaction.create({
    data: { name: "Bob Castellino", amount: 500, type: "expense", recurrence: "none", startDate: "2026-03-30" },
  });

  // == April 2026 ==
  // Sat Apr 4
  await prisma.transaction.create({
    data: { name: "amber last week", amount: 225, type: "expense", recurrence: "none", startDate: "2026-04-04" },
  });
  await prisma.transaction.create({
    data: { name: "Beth debt", amount: 333, type: "expense", recurrence: "none", startDate: "2026-04-04" },
  });

  // Sun Apr 5 (empty)

  // Fri Apr 9
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
    data: { name: "Express Toll and...", amount: 30, type: "expense", recurrence: "monthly", startDate: "2026-04-11" },
  });
  await prisma.transaction.create({
    data: { name: "Open AI", amount: 20, type: "expense", recurrence: "monthly", startDate: "2026-04-11" },
  });

  // Sun Apr 12 (also appears May 12 — monthly recurring)
  await prisma.transaction.create({
    data: { name: "wayfair", amount: 36, type: "expense", recurrence: "monthly", startDate: "2026-04-12" },
  });

  // Sat Apr 16 (not visible? Let me check — May 2026 screenshot shows Chewy for Arw on Sat May 16 $41.98, so it's monthly)
  // Actually in the May screenshot, Sat May 16 shows: Chewy for Arw $41.98, Vanessa 2 of 3 $500 (one-time)

  // Monthly on the 17th
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

  // Monthly on the 25th
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

  // Fri May 1 one-time
  await prisma.transaction.create({
    data: { name: "Vanessa 2 of 3", amount: 500, type: "expense", recurrence: "none", startDate: "2026-05-01" },
  });

  // Sun May 3 (visible in May screenshot)
  await prisma.transaction.create({
    data: { name: "You Tube", amount: 78.98, type: "expense", recurrence: "none", startDate: "2026-05-03" },
  });

  // Sun May 10
  await prisma.transaction.create({
    data: { name: "Attitude Credit", amount: 299, type: "expense", recurrence: "none", startDate: "2026-05-10" },
  });
  await prisma.transaction.create({
    data: { name: "Beth Honda", amount: 691, type: "expense", recurrence: "none", startDate: "2026-05-10" },
  });
  await prisma.transaction.create({
    data: { name: "Den Honda", amount: 500, type: "expense", recurrence: "none", startDate: "2026-05-10" },
  });

  // Mon May 11 — covered by monthly recurring from Apr 11

  // Sat May 16 — only Amber Pet Care (weekly) and Chewy for Arw (monthly), no Vanessa

  // Sun May 17 — covered by monthly recurring from Apr 17

  // Sat May 18
  // (Amber Pet Care is weekly, already handled)

  // Sat May 25 — covered by monthly recurring from Apr 25

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
