import { prisma } from "@/lib/prisma";
import { loadState } from "@/lib/load-state";
import { reconcile, type BankTransaction } from "@/lib/reconcile";
import { decryptToken, plaid, todayKey } from "@/lib/plaid";

// One sync of one linked bank login: read the tracked account's balance,
// pull transactions posted since the last cursor, and (when apply is true)
// write today's balance reset plus "already cleared" moves through the same
// reconcile() the screenshot path uses. Never deletes anything.

export interface SyncResult {
  itemId: string;
  institutionName: string;
  account: { id: string; name: string; mask: string; balance: number } | null;
  accounts: { id: string; name: string; mask: string; balance: number; type: string }[];
  transactions: BankTransaction[];
  unknown: UnknownRow[]; // posted at the bank, nothing on the calendar matches (already in the balance)
  applied: { reset: boolean; moved: number } | null;
  error?: string;
}

export interface UnknownRow { date: string; name: string; amount: number; type: "income" | "expense" }

function mergeUnknown(prev: string, add: UnknownRow[]): UnknownRow[] {
  let list: UnknownRow[] = [];
  try { list = JSON.parse(prev || "[]"); } catch { list = []; }
  const key = (r: UnknownRow) => `${r.date}|${r.name}|${r.amount}`;
  const seen = new Set(list.map(key));
  add.forEach((r) => { if (!seen.has(key(r))) { list.push(r); seen.add(key(r)); } });
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const minDate = cutoff.toISOString().slice(0, 10);
  return list.filter((r) => r.date >= minDate).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
}

type Item = Awaited<ReturnType<typeof prisma.plaidItem.findFirstOrThrow>>;

export async function syncItem(item: Item, opts: { apply: boolean }): Promise<SyncResult> {
  const token = decryptToken(item.accessToken);
  const api = plaid();
  const base: SyncResult = { itemId: item.itemId, institutionName: item.institutionName, account: null, accounts: [], transactions: [], unknown: [], applied: null };
  try {
    const bal = await api.accountsBalanceGet({ access_token: token });
    const accounts = bal.data.accounts.map((a) => ({
      id: a.account_id,
      name: a.official_name || a.name,
      mask: a.mask || "",
      balance: Number(a.balances.current ?? a.balances.available ?? 0),
      available: a.balances.available,
      type: String(a.type),
      subtype: String(a.subtype || ""),
    }));
    base.accounts = accounts.map(({ id, name, mask, balance, type }) => ({ id, name, mask, balance, type }));

    // Which account does the calendar follow? The chosen one, else the only
    // checking account, else nothing until the user picks.
    let tracked = accounts.find((a) => a.id === item.trackedAccountId) || null;
    if (!tracked) {
      const checking = accounts.filter((a) => a.type === "depository" && a.subtype === "checking");
      if (checking.length === 1) tracked = checking[0];
    }
    if (tracked) base.account = { id: tracked.id, name: tracked.name, mask: tracked.mask, balance: tracked.balance };

    // Transactions since the last cursor. Only posted rows; pending ones are
    // not in the balance yet and would double count.
    let cursor = item.cursor || undefined;
    const added: BankTransaction[] = [];
    for (let i = 0; i < 20; i++) {
      const page = await api.transactionsSync({ access_token: token, cursor, count: 500 });
      page.data.added.forEach((t) => {
        if (t.pending) return;
        if (tracked && t.account_id !== tracked.id) return;
        added.push({ date: t.date, name: t.merchant_name || t.name, amount: -Number(t.amount), runningBalance: null });
      });
      cursor = page.data.next_cursor;
      if (!page.data.has_more) break;
    }
    base.transactions = added;

    const now = new Date();
    const update: Record<string, unknown> = { lastSyncedAt: now, status: "ok", lastError: "" };
    if (tracked) {
      update.lastBalance = tracked.balance;
      if (!item.trackedAccountId) { update.trackedAccountId = tracked.id; update.trackedName = tracked.name; update.trackedMask = tracked.mask; }
    }

    // Match the new posted rows against the calendar whenever there is a
    // tracked account, so the panel can show what the bank has that the
    // calendar does not. Writes happen only under apply.
    let matched: ReturnType<typeof reconcile> | null = null;
    if (tracked && added.length) {
      const state = await loadState(item.userId);
      matched = reconcile({ accounts: [{ name: tracked.name, last4: tracked.mask, balance: tracked.balance }], transactions: added }, state);
      base.unknown = matched.unaccounted.map((u) => ({ date: u.date, name: u.name, amount: u.amount, type: u.type === "income" ? "income" : "expense" }));
    }

    if (opts.apply && tracked) {
      const today = todayKey();
      await prisma.balanceReset.upsert({
        where: { userId_date: { userId: item.userId, date: today } },
        update: { amount: tracked.balance },
        create: { userId: item.userId, date: today, amount: tracked.balance },
      });
      let moved = 0;
      if (matched) {
        for (const m of matched.moved) {
          await prisma.override.upsert({
            where: { transactionId_occurrenceDate: { transactionId: m.txId, occurrenceDate: m.occurrenceDate } },
            update: { movedTo: m.to },
            create: { transactionId: m.txId, occurrenceDate: m.occurrenceDate, movedTo: m.to },
          });
          moved++;
        }
      }
      update.cursor = cursor; // consume the cursor only once the rows have been acted on
      update.lastUnknown = JSON.stringify(mergeUnknown(item.lastUnknown, base.unknown));
      base.applied = { reset: true, moved };
    }
    await prisma.plaidItem.update({ where: { id: item.id }, data: update });
    return base;
  } catch (e) {
    const err = e as { response?: { data?: { error_code?: string; error_message?: string } }; message?: string };
    const code = err.response?.data?.error_code || "";
    const msg = err.response?.data?.error_message || err.message || "sync failed";
    await prisma.plaidItem.update({
      where: { id: item.id },
      data: { status: code === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error", lastError: `${code} ${msg}`.trim() },
    });
    return { ...base, error: `${code} ${msg}`.trim() };
  }
}
