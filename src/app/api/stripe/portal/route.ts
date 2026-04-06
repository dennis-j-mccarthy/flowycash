import { stripe } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    // Find the customer from their checkout session
    const sessions = await stripe.checkout.sessions.list({ limit: 20 });
    const userSession = sessions.data.find(
      (s) => s.client_reference_id === userId && s.customer
    );

    if (!userSession?.customer) {
      return NextResponse.json({ error: "No billing account found" }, { status: 404 });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: userSession.customer as string,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/app`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (e) {
    console.error("Stripe portal error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
