import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import type { BankTransaction } from "@/lib/reconcile";

// Find the first header whose normalized name matches one of the candidates.
function pickHeader(headers: string[], candidates: string[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const c of candidates) {
    const cn = norm(c);
    const hit = headers.find((h) => norm(h) === cn || norm(h).includes(cn));
    if (hit) return hit;
  }
  return null;
}

function toIso(raw: string): string {
  const s = (raw || "").trim();
  // Already ISO-ish
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  // MM/DD/YYYY or M/D/YY
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (us) {
    let y = us[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return s;
}

function toNum(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).replace(/[$,\s]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const csv: string = body.csv || "";
    if (!csv.trim()) {
      return NextResponse.json({ error: "No CSV content provided" }, { status: 400 });
    }

    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    const rows = parsed.data || [];
    const headers = parsed.meta.fields || [];

    const dateH = pickHeader(headers, ["Date", "Transaction Date", "Posted Date", "Posting Date"]);
    const nameH = pickHeader(headers, ["Description", "Name", "Payee", "Merchant", "Memo", "Details"]);
    const amountH = pickHeader(headers, ["Amount", "Transaction Amount"]);
    const debitH = pickHeader(headers, ["Debit", "Withdrawal", "Withdrawals"]);
    const creditH = pickHeader(headers, ["Credit", "Deposit", "Deposits"]);
    const balanceH = pickHeader(headers, ["Balance", "Running Balance", "Running Bal"]);

    const transactions: BankTransaction[] = [];
    for (const row of rows) {
      const date = dateH ? toIso(row[dateH]) : "";
      const name = (nameH ? row[nameH] : "").trim();
      let amount: number | null = amountH ? toNum(row[amountH]) : null;
      if (amount == null) {
        // Split debit/credit columns: debits are negative, credits positive.
        const debit = debitH ? toNum(row[debitH]) : null;
        const credit = creditH ? toNum(row[creditH]) : null;
        if (debit != null && debit !== 0) amount = -Math.abs(debit);
        else if (credit != null && credit !== 0) amount = Math.abs(credit);
      }
      if (!date || amount == null) continue;
      transactions.push({
        date,
        name: name || "Transaction",
        amount,
        runningBalance: balanceH ? toNum(row[balanceH]) : null,
      });
    }

    return NextResponse.json({ screenType: "transactions", accounts: [], transactions });
  } catch (e) {
    console.error("POST /api/reconcile/csv error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
