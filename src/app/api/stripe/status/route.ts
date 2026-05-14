import { stripe } from "@/lib/stripe";
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ subscribed: false });

    // Admin/owner bypass — always Pro
    const ADMIN_EMAILS = ["dennisjmccarthy@gmail.com", "yogabeth@mac.com"];
    const user = await currentUser();
    const userEmail = user?.emailAddresses?.[0]?.emailAddress;
    console.log("Admin check:", { userId, userEmail, match: userEmail ? ADMIN_EMAILS.includes(userEmail) : false });
    if (userEmail && ADMIN_EMAILS.includes(userEmail)) {
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
        currentPeriodEnd: (sub as any).current_period_end,
      });
    }

    return NextResponse.json({ subscribed: false });
  } catch (e) {
    console.error("Stripe status error:", e);
    return NextResponse.json({ subscribed: false });
  }
}
