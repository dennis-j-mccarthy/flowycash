import { stripe } from "@/lib/stripe";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ subscribed: false });

    // Admin/owner bypass — always Pro
    const ADMIN_IDS = ["user_3BrDIpzkDVH9nmMx0EB0JDeCSHQ"];
    if (ADMIN_IDS.includes(userId)) {
      return NextResponse.json({ subscribed: true, status: "active", admin: true });
    }

    // Check if this user has an active subscription
    const sessions = await stripe.checkout.sessions.list({
      limit: 10,
    });

    const userSession = sessions.data.find(
      (s) => s.client_reference_id === userId && s.payment_status === "paid"
    );

    if (!userSession) return NextResponse.json({ subscribed: false });

    // Lifetime (one-time payment)
    if (userSession.mode === "payment" && userSession.payment_status === "paid") {
      return NextResponse.json({ subscribed: true, status: "lifetime", plan: "lifetime" });
    }

    // Subscription
    if (userSession.subscription) {
      const sub = await stripe.subscriptions.retrieve(userSession.subscription as string);
      return NextResponse.json({
        subscribed: sub.status === "active" || sub.status === "trialing",
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
      });
    }

    return NextResponse.json({ subscribed: false });
  } catch (e) {
    console.error("Stripe status error:", e);
    return NextResponse.json({ subscribed: false });
  }
}
