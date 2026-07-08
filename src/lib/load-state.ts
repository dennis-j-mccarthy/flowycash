import { prisma } from "@/lib/prisma";
import type { AppState } from "@/lib/types";

// Assemble an AppState for a user from the database — same shape the client
// consumes via /api/state. Shared by the notification routes.
export async function loadState(userId: string): Promise<AppState> {
  const [transactions, overrides, balanceResets, settings] = await Promise.all([
    prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.override.findMany({ where: { transaction: { userId } } }),
    prisma.balanceReset.findMany({ where: { userId } }),
    prisma.settings.findFirst({ where: { userId } }),
  ]);
  const overridesMap: Record<string, (typeof overrides)[number]> = {};
  overrides.forEach((o) => { overridesMap[`${o.transactionId}::${o.occurrenceDate}`] = o; });
  const resetsMap: Record<string, number> = {};
  balanceResets.forEach((r) => { resetsMap[r.date] = r.amount; });
  return {
    transactions: transactions as unknown as AppState["transactions"],
    overrides: overridesMap as unknown as AppState["overrides"],
    balanceResets: resetsMap,
    startingBalance: settings?.startingBalance ?? 0,
  };
}
