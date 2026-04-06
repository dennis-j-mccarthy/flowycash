import { stripe } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const plan = body.plan || "monthly"; // "monthly" | "yearly" | "lifetime"

    // Find or create product
    const products = await stripe.products.list({ limit: 10, active: true });
    let product = products.data.find((p) => p.name === "flowycash Pro");
    if (!product) {
      product = await stripe.products.create({
        name: "flowycash Pro",
        description: "Full cashflow calendar — unlimited transactions, tags, charts, dashboard, backup/restore",
      });
    }

    // Find or create the right price
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
    let price;

    if (plan === "lifetime") {
      price = prices.data.find((p) => !p.recurring && p.unit_amount === 7900);
      if (!price) {
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: 7900, // $79
          currency: "usd",
        });
      }
    } else if (plan === "yearly") {
      price = prices.data.find((p) => p.recurring?.interval === "year");
      if (!price) {
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: 7900, // $79/year (save ~$29)
          currency: "usd",
          recurring: { interval: "year" },
        });
      }
    } else {
      price = prices.data.find((p) => p.recurring?.interval === "month");
      if (!price) {
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: 900, // $9/month
          currency: "usd",
          recurring: { interval: "month" },
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: plan === "lifetime" ? "payment" : "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/app?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/app`,
      metadata: { clerkUserId: userId, plan },
      client_reference_id: userId,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("Stripe checkout error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
