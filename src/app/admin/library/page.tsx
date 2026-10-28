import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Library } from "@/components/Library";

// Unlisted admin route. The Library is the source of truth for every image
// the post maker and the hero pickers offer; edits are guarded server-side
// by ADMIN_PASSCODE and need DIRECT_DATABASE_URL.
export const metadata: Metadata = {
  title: "Library",
  robots: { index: false, follow: false },
};

export default function AdminLibraryPage() {
  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-6xl">
        <header className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Admin · Creative
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">Library</h1>
          <p className="mt-3 text-xl leading-relaxed text-muted">
            Every image the site uses, in one place. The library dictates which images the posts get.
          </p>
        </header>
        <div className="mt-8">
          <Library />
        </div>
        <p className="mt-12 text-center text-sm text-muted">
          <Link href="/admin/social" className="font-semibold text-accent-strong hover:underline">
            Post maker
          </Link>
          {" · "}
          <Link href="/admin/blog/posts" className="font-semibold text-accent-strong hover:underline">
            Blogs
          </Link>
        </p>
      </Container>
    </section>
  );
}
