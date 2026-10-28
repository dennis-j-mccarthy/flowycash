import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { BlogPosts } from "@/components/BlogPosts";

// Unlisted admin route: not in the nav, kept out of search and the sitemap.
// Reads/writes are guarded server-side by ADMIN_PASSCODE and need DIRECT_DATABASE_URL.
export const metadata: Metadata = {
  title: "Blogs",
  robots: { index: false, follow: false },
};

export default function AdminBlogPostsPage() {
  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-3xl">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Admin · Blog
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">Blogs</h1>
          <p className="mt-3 text-xl leading-relaxed text-muted">
            Drafts from the generator land here. Edit, publish, and the social
            drafts write themselves.
          </p>
        </header>

        <div className="mt-8">
          <BlogPosts />
        </div>

        <p className="mt-12 text-center text-sm text-muted">
          <Link href="/admin/blog" className="font-semibold text-accent-strong hover:underline">
            Generator
          </Link>
          {" · "}
          <Link href="/admin/social" className="font-semibold text-accent-strong hover:underline">
            Post maker
          </Link>
        </p>
      </Container>
    </section>
  );
}
