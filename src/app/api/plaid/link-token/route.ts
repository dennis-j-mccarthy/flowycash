import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth-helpers";
import { LINK_COUNTRIES, LINK_PRODUCTS, PLAID_ENV, plaid, plaidConfigured } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/plaid";

// Creates a Plaid Link token for the signed-in user. Pass { itemId } to open
// Link in update mode for an existing login (re-auth after ITEM_LOGIN_REQUIRED).
export async function POST(req: NextRequest) {
  if (!plaidConfigured()) return NextResponse.json({ error: "Plaid is not configured" }, { status: 500 });
  const { userId: clerkId } = await auth();
  let userId: string;
  try { userId = await resolveUserId(clerkId); } catch { return NextResponse.json({ error: "Not signed in" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "https://www.flowycash.com";
  const webhook = process.env.PLAID_WEBHOOK_URL || `${origin}/api/plaid/webhook`;
  const redirect = process.env.PLAID_REDIRECT_URI || (PLAID_ENV === "production" ? `${origin}/plaid/oauth` : undefined);

  try {
    let access_token: string | undefined;
    if (body.itemId) {
      const item = await prisma.plaidItem.findFirst({ where: { userId, itemId: body.itemId } });
      if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 404 });
      access_token = decryptToken(item.accessToken);
    }
    const res = await plaid().linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Flowy Cash",
      language: "en",
      country_codes: LINK_COUNTRIES,
      ...(access_token ? { access_token } : { products: LINK_PRODUCTS }),
      webhook,
      ...(redirect ? { redirect_uri: redirect } : {}),
      transactions: { days_requested: 90 },
    });
    return NextResponse.json({ link_token: res.data.link_token, expiration: res.data.expiration, env: PLAID_ENV });
  } catch (e) {
    const err = e as { response?: { data?: { error_message?: string } }; message?: string };
    return NextResponse.json({ error: err.response?.data?.error_message || err.message || "link token failed" }, { status: 502 });
  }
}
