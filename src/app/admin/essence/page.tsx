import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { EssenceEditor } from "@/components/EssenceEditor";

// Unlisted admin route. The Essence is read by every generator
// (src/lib/brandContext.ts); edits are guarded server-side by ADMIN_PASSCODE.
export const metadata: Metadata = {
  title: "Essence",
  robots: { index: false, follow: false },
};

export default function AdminEssencePage() {
  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-3xl">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Admin · Strategy
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">Essence</h1>
          <p className="mt-3 text-xl leading-relaxed text-muted">
            The line, the voice and the tone every builder and channel reads from.
          </p>
        </header>
        <div className="mt-8">
          <EssenceEditor />
        </div>
      </Container>
    </section>
  );
}
