import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { encryptToken, plaid, plaidConfigured } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { syncItem } from "@/lib/plaid-sync";

// After Link succeeds the browser posts the public_token here. We swap it for
// a long-lived access token, store it encrypted, and run a first sync (read
// only) so the client can show the accounts and let the user pick one.
export async function POST(req: NextRequest) {
  if (!plaidConfigured()) return NextResponse.json({ error: "Plaid is not configured" }, { status: 500 });
  const { userId: clerkId } = await auth();
  let userId: string;
  try { userId = await resolveUserId(clerkId); } catch { return NextResponse.json({ error: "Not signed in" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const publicToken: string | undefined = body.public_token;
  if (!publicToken) return NextResponse.json({ error: "public_token required" }, { status: 400 });
  const institution = body.metadata?.institution || {};

  try {
    const ex = await plaid().itemPublicTokenExchange({ public_token: publicToken });
    const item = await prisma.plaidItem.upsert({
      where: { itemId: ex.data.item_id },
      update: { userId, accessToken: encryptToken(ex.data.access_token), status: "ok", lastError: "" },
      create: {
        userId,
        itemId: ex.data.item_id,
        accessToken: encryptToken(ex.data.access_token),
        institutionId: institution.institution_id || "",
        institutionName: institution.name || "",
      },
    });
    const first = await syncItem(item, { apply: false });
    return NextResponse.json({ ok: true, itemId: item.itemId, institutionName: item.institutionName, accounts: first.accounts, account: first.account, error: first.error });
  } catch (e) {
    const err = e as { response?: { data?: { error_message?: string } }; message?: string };
    return NextResponse.json({ error: err.response?.data?.error_message || err.message || "exchange failed" }, { status: 502 });
  }
}
