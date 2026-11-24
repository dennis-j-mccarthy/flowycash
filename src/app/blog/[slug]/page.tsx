import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { POSTS, PRACTICES, getPost } from "@/content/posts";
import { QUOTES } from "@/content/quotes";
import { renderMarkdown } from "@/lib/md";
import FillNumbers from "../FillNumbers";
import "../blog.css";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  return post ? { title: `${post.title} · Flowy Cash`, description: post.excerpt } : {};
}

// Sample values shown until the reader's own numbers arrive (or when signed out).
const SAMPLE: Record<string, string> = {
  lowest: "$974",
  lowestDate: "Nov 26",
  lowestVerdict: "It is above zero, so the next few weeks are handled.",
  nextIncome: "$1,400",
  nextIncomeDate: "Dec 1",
  greenDays: "21",
};

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const hasFills = /\{\{\w+\}\}/.test(post.body);
  const html = renderMarkdown(post.body).replace(/\{\{(\w+)\}\}/g, (_, k: string) => `<span class="fill" data-fill="${k}">${SAMPLE[k] ?? ""}</span>`);
  const quote = QUOTES.find((q) => q.post === post.slug);
  const others = POSTS.filter((p) => p.slug !== post.slug && (p.practice === post.practice || post.practice === "all")).slice(0, 3);
  const date = new Date(post.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="fc-blog">
      <div className="wrap">
        <div className="top">
          <Link href="/" className="brand">flowycash</Link>
          <nav className="nav"><Link href="/blog">Articles</Link><Link href="/method">The method</Link><Link href="/app">Open the calendar</Link></nav>
        </div>
        <span className="kicker">{PRACTICES[post.practice].name} · {PRACTICES[post.practice].line}</span>
        <h1>{post.title}</h1>
        <p className="lede">{post.excerpt}</p>
        <div className="meta">{date} · {post.minutes} min read</div>
        {hasFills && <FillNumbers />}
        <article dangerouslySetInnerHTML={{ __html: html }} />
        {quote && (
          <div className="quote">
            <div className="q">&ldquo;{quote.text}&rdquo;</div>
            <div className="a">{quote.attributed ? "Attributed to " : ""}{quote.who} · {quote.source}</div>
          </div>
        )}
        <div className="cta">
          <div className="h">The screen this article is about is one tap away.</div>
          <p>Open the calendar and the Low pill in the header is your lowest point for the next 45 days.</p>
          <Link href="/app">Open the calendar</Link>
        </div>
        {others.length > 0 && (
          <div className="next">
            <div className="h">More from the method</div>
            <div className="cards">
              {others.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="card">
                  <span className="kicker">{PRACTICES[p.practice].name}</span>
                  <div className="t">{p.title}</div>
                  <div className="x">{p.excerpt}</div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
