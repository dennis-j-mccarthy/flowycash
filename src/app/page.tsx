"use client";

import { useState, useEffect } from "react";
import { SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";

const SCREENSHOTS = [
  {
    url: "https://ik.imagekit.io/jnwpkntpm/negative-days.png",
    title: "See Every Dollar, Every Day",
    subtitle: "Your monthly cashflow on a calendar",
    description: "No more spreadsheets. No more guessing. See exactly when money comes in, when it goes out, and what your balance looks like every single day of the month.",
  },
  {
    url: "https://ik.imagekit.io/jnwpkntpm/week-view.jpg",
    title: "Zoom Into Any Week",
    subtitle: "Detailed week-at-a-glance view",
    description: "Click the magnifying glass on any week to expand it. See every transaction, every balance, every recurring charge — at a glance. Drag to reschedule.",
  },
  {
    url: "https://ik.imagekit.io/jnwpkntpm/transaction-settings.png",
    title: "Smart Transaction Management",
    subtitle: "Tags, highlights, autopay, notes — all in one place",
    description: "Color-code your expenses. Tag them by category. Mark autopay items so the advisor knows what can't be moved. Add notes for context.",
  },
  {
    url: "https://ik.imagekit.io/jnwpkntpm/cashflow-chart.png",
    title: "Cashflow at a Glance",
    subtitle: "Green when you're good. Red when you're not.",
    description: "The balance trend chart shows your financial health across the month. Spot trouble weeks before they hit. Green above zero, red below — it's that simple.",
  },
  {
    url: "https://ik.imagekit.io/jnwpkntpm/month-dashboard.png",
    title: "Monthly Dashboard",
    subtitle: "Income, expenses, risks, categories — one view",
    description: "Top expenses ranked. Spending by category with progress bars. Negative day warnings. Low cashflow weeks. Annotated items. Share it via email in one click.",
  },
];

const FEATURES = [
  { icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", title: "Calendar View", text: "Every transaction on a beautiful monthly calendar" },
  { icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", title: "Running Balance", text: "See your bank balance change day by day" },
  { icon: "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z", title: "Tags & Categories", text: "Organize spending with color-coded tags" },
  { icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8", title: "Autopay Tracking", text: "Mark autopay items — know what's fixed vs flexible" },
  { icon: "M22 12 18 12 15 21 9 3 6 12 2 12", title: "Balance Chart", text: "Visual trend line — green above zero, red below" },
  { icon: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z", title: "Smart Advice", text: "Get strategies when your balance goes negative" },
  { icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", title: "Notes & Annotations", text: "Add context to any transaction or month" },
  { icon: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z", title: "Voice Commands", text: "Add expenses, check balances — hands-free" },
  { icon: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3", title: "Backup & Restore", text: "Your data, your control — export anytime" },
];

export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [activeShot, setActiveShot] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [wantsPro, setWantsPro] = useState(false);

  // After sign-up, if they wanted Pro, redirect to checkout
  useEffect(() => {
    if (isSignedIn && wantsPro) {
      setWantsPro(false);
      fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "monthly" }) })
        .then((r) => r.json())
        .then(({ url }) => { if (url) window.location.href = url; else router.push("/app"); });
    }
  }, [isSignedIn, wantsPro]);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-advance screenshots
  useEffect(() => {
    const t = setInterval(() => setActiveShot((s) => (s + 1) % SCREENSHOTS.length), 6000);
    return () => clearInterval(t);
  }, []);

  const shot = SCREENSHOTS[activeShot];

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "#1e293b" }}>
      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: scrollY > 50 ? "rgba(255,255,255,0.95)" : "transparent", backdropFilter: scrollY > 50 ? "blur(12px)" : "none", transition: "all 0.3s", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo.png" alt="flowycash" style={{ height: 36 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {isLoaded && isSignedIn ? (
            <button onClick={() => router.push("/app")} style={{ padding: "10px 28px", borderRadius: 12, border: "none", background: "#065f46", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Open App →
            </button>
          ) : (
            <>
              <SignInButton mode="modal">
                <button style={{ padding: "10px 20px", borderRadius: 12, border: "1.5px solid #e2e8f0", background: "#fff", color: "#1e293b", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Sign In
                </button>
              </SignInButton>
              <SignInButton mode="modal">
                <button style={{ padding: "10px 28px", borderRadius: 12, border: "none", background: "#065f46", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  Get Started Free
                </button>
              </SignInButton>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: 120, paddingBottom: 80, textAlign: "center", background: "linear-gradient(180deg, #ecfdf5 0%, #fff 100%)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "inline-block", padding: "6px 16px", borderRadius: 20, background: "#d1fae5", color: "#065f46", fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
            Personal cashflow forecasting
          </div>
          <h1 style={{ fontSize: 56, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.1, margin: "0 0 20px", color: "#065f46" }}>
            Know Your Money<br />Before It Moves
          </h1>
          <p style={{ fontSize: 20, color: "#64748b", lineHeight: 1.6, maxWidth: 560, margin: "0 auto 36px" }}>
            See every dollar coming in and going out — on a calendar. Spot negative days before they happen. Drag expenses to fix them.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 48 }}>
            {isLoaded && isSignedIn ? (
              <button onClick={() => router.push("/app")} style={{ padding: "14px 36px", borderRadius: 14, border: "none", background: "#065f46", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(6,95,70,0.3)" }}>
                Open Your Calendar →
              </button>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button style={{ padding: "14px 36px", borderRadius: 14, border: "none", background: "#065f46", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(6,95,70,0.3)" }}>
                    Start Free →
                  </button>
                </SignInButton>
                <button onClick={() => router.push("/app")} style={{ padding: "14px 36px", borderRadius: 14, border: "1.5px solid #e2e8f0", background: "#fff", color: "#1e293b", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
                  Try Demo
                </button>
              </>
            )}
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>No credit card required · Free forever for basic use</div>
        </div>
      </section>

      {/* Screenshot Showcase */}
      <section style={{ padding: "60px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
          {/* Left: text */}
          <div style={{ flex: "0 0 340px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{shot.subtitle}</div>
            <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2, margin: "0 0 16px", color: "#065f46" }}>{shot.title}</h2>
            <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.7, marginBottom: 28 }}>{shot.description}</p>
            {/* Dots */}
            <div style={{ display: "flex", gap: 8 }}>
              {SCREENSHOTS.map((_, i) => (
                <div key={i} onClick={() => setActiveShot(i)}
                  style={{ width: i === activeShot ? 28 : 8, height: 8, borderRadius: 4, background: i === activeShot ? "#065f46" : "#d1d5db", cursor: "pointer", transition: "all 0.3s" }} />
              ))}
            </div>
          </div>
          {/* Right: screenshot */}
          <div style={{ flex: 1, borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.12)", border: "1px solid #e2e8f0" }}>
            <img src={shot.url} alt={shot.title} style={{ width: "100%", display: "block", transition: "opacity 0.3s" }} />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section style={{ padding: "80px 24px", background: "#f8fafc" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#065f46", margin: "0 0 12px" }}>Everything You Need</h2>
            <p style={{ fontSize: 17, color: "#64748b" }}>Built for people who want to see where their money goes — not just where it went.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ padding: "24px", borderRadius: 16, background: "#fff", border: "1px solid #e2e8f0" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#065f46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}><path d={f.icon} /></svg>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>{f.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#065f46", margin: "0 0 12px" }}>Simple Pricing</h2>
          <p style={{ fontSize: 17, color: "#64748b", marginBottom: 40 }}>Start free. Upgrade when you're ready.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 640, margin: "0 auto" }}>
            {/* Free */}
            <div style={{ padding: "32px", borderRadius: 20, border: "1.5px solid #e2e8f0", background: "#fff", textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>Free</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#1e293b", marginBottom: 16 }}>$0<span style={{ fontSize: 16, fontWeight: 500, color: "#94a3b8" }}>/mo</span></div>
              <div style={{ fontSize: 14, color: "#64748b", lineHeight: 2 }}>
                ✓ Demo mode with sample data<br />
                ✓ Full calendar view<br />
                ✓ Chart & dashboard<br />
                ✓ Tutorial walkthrough<br />
                <span style={{ color: "#cbd5e1" }}>✗ Your own transactions</span><br />
                <span style={{ color: "#cbd5e1" }}>✗ Backup & restore</span><br />
                <span style={{ color: "#cbd5e1" }}>✗ Tags & categories</span>
              </div>
              <SignInButton mode="modal">
                <button style={{ marginTop: 20, width: "100%", padding: "12px", borderRadius: 12, border: "1.5px solid #e2e8f0", background: "#fff", color: "#1e293b", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Get Started
                </button>
              </SignInButton>
            </div>
            {/* Pro */}
            <div style={{ padding: "32px", borderRadius: 20, border: "2px solid #065f46", background: "#ecfdf5", textAlign: "left", position: "relative" }}>
              <div style={{ position: "absolute", top: -12, right: 20, background: "#065f46", color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 10 }}>POPULAR</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#065f46", marginBottom: 4 }}>Pro</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#065f46", marginBottom: 16 }}>$9<span style={{ fontSize: 16, fontWeight: 500, color: "#64748b" }}>/mo</span></div>
              <div style={{ fontSize: 14, color: "#064e3b", lineHeight: 2 }}>
                ✓ Everything in Free<br />
                ✓ Unlimited transactions<br />
                ✓ Tags, categories & filters<br />
                ✓ Backup & restore<br />
                ✓ Voice commands<br />
                ✓ Color themes<br />
                ✓ Smart advice on negative days
              </div>
              {isSignedIn ? (
                <button onClick={async () => {
                  const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: "monthly" }) });
                  const { url } = await res.json();
                  if (url) window.location.href = url;
                }} style={{ marginTop: 20, width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "#065f46", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  Subscribe Pro →
                </button>
              ) : (
                <SignUpButton mode="modal">
                  <button onClick={() => setWantsPro(true)} style={{ marginTop: 20, width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "#065f46", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    Start Pro →
                  </button>
                </SignUpButton>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "80px 24px", background: "#065f46", textAlign: "center" }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", margin: "0 0 12px" }}>Stop Wondering. Start Knowing.</h2>
        <p style={{ fontSize: 17, color: "#a7f3d0", marginBottom: 32 }}>Your cashflow calendar is one click away.</p>
        {isLoaded && isSignedIn ? (
          <button onClick={() => router.push("/app")} style={{ padding: "16px 40px", borderRadius: 14, border: "none", background: "#fff", color: "#065f46", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
            Open Your Calendar →
          </button>
        ) : (
          <SignInButton mode="modal">
            <button style={{ padding: "16px 40px", borderRadius: 14, border: "none", background: "#fff", color: "#065f46", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
              Get Started Free →
            </button>
          </SignInButton>
        )}
      </section>

      {/* Footer */}
      <footer style={{ padding: "32px 24px", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
        <img src="/logo.png" alt="flowycash" style={{ height: 28, marginBottom: 8 }} />
        <div>© {new Date().getFullYear()} flowycash.com · Personal cashflow forecasting</div>
      </footer>
    </div>
  );
}
