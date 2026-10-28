import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { EmailMaker } from "@/components/EmailMaker";

// Unlisted admin route. Newsletter generation is guarded server-side by
// ADMIN_PASSCODE and needs DIRECT_DATABASE_URL (+ ANTHROPIC_API_KEY for the copy).
export const metadata: Metadata = {
  title: "Email",
  robots: { index: false, follow: false },
};

export default function AdminEmailPage() {
  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-6xl">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Admin · Email
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">Email maker</h1>
          <p className="mt-3 text-xl leading-relaxed text-muted">
            Turn one to three published posts into a newsletter — subject lines, preheader, HTML and plain text.
          </p>
        </header>
        <div className="mt-8">
          <EmailMaker />
        </div>
      </Container>
    </section>
  );
}
