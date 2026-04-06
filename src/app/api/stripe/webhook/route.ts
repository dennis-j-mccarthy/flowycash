import { stripe } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  // For local dev without webhook signing, just parse the event
  let event;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
      event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(body);
    }
  } catch (e) {
    console.error("Webhook error:", e);
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    console.log(`✅ Subscription active for user: ${session.client_reference_id}`);
    // In production, store subscription status in your DB
  }

  if (event.type === "customer.subscription.deleted") {
    console.log("❌ Subscription cancelled");
  }

  return NextResponse.json({ ok: true });
}
