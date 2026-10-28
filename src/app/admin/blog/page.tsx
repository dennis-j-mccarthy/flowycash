import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { BlogGenerator } from "@/components/BlogGenerator";

// Unlisted admin route: not in the nav, kept out of search and the sitemap.
// Generation is guarded server-side by ADMIN_PASSCODE and needs ANTHROPIC_API_KEY.
export const metadata: Metadata = {
  title: "Blog generator",
  robots: { index: false, follow: false },
};

export default function AdminBlogPage() {
  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-2xl">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Admin · Blog
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">
            Blog generator
          </h1>
          <p className="mt-3 text-xl leading-relaxed text-muted">
            Set the tone, get title ideas, then write the full post. You edit
            and publish.
          </p>
        </header>

        <div className="mt-8">
          <BlogGenerator />
        </div>

        <p className="mt-12 text-center text-sm text-muted">
          <Link href="/admin/blog/posts" className="font-semibold text-accent-strong hover:underline">
            Blogs — saved &amp; publishing →
          </Link>
          {" · "}
          <Link href="/admin/library" className="font-semibold text-accent-strong hover:underline">
            Library →
          </Link>
        </p>
      </Container>
    </section>
  );
}
