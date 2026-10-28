import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { SocialComposer } from "@/components/SocialComposer";

// Unlisted admin route: not in the nav, kept out of search and the sitemap.
// Posting itself is guarded server-side by ADMIN_PASSCODE, and needs a Meta
// Page token in the environment (META_PAGE_ID + META_PAGE_TOKEN).
export const metadata: Metadata = {
  title: "Social",
  robots: { index: false, follow: false },
};

export default function AdminSocialPage() {
  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-5xl">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Admin · Social
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">
            Post maker
          </h1>
          <p className="mt-3 text-xl leading-relaxed text-muted">
            Image → platform → pillar → caption. Then publish or schedule it to
            the Facebook Page — and Instagram — straight from here.
          </p>
        </header>

        <div className="mt-8">
          <SocialComposer />
        </div>

        <p className="mt-12 text-center text-sm text-muted">
          <Link href="/admin/blog/posts" className="font-semibold text-accent-strong hover:underline">
            Blogs
          </Link>
          {" · "}
          <Link href="/admin/library" className="font-semibold text-accent-strong hover:underline">
            Library
          </Link>
          {" · "}
          <Link href="/admin/blog" className="font-semibold text-accent-strong hover:underline">
            Generator
          </Link>
        </p>
      </Container>
    </section>
  );
}
