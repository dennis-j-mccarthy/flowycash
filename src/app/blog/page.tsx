import Link from "next/link";
import type { Metadata } from "next";
import { POSTS, PRACTICES } from "@/content/posts";
import "./blog.css";

export const metadata: Metadata = {
  title: "The Flowy Cash Method · articles",
  description: "Short pieces on money, fear, and the calendar: know the real number, place every dollar on a day, find the lowest point, move before it bites, and come back when you fall off.",
};

export default function BlogIndex() {
  const posts = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="fc-blog">
      <div className="wrap">
        <div className="top">
          <Link href="/" className="brand">flowycash</Link>
          <nav className="nav"><Link href="/method">The method</Link><Link href="/app">Open the calendar</Link></nav>
        </div>
        <span className="kicker">Articles</span>
        <h1>Money, fear, and the calendar.</h1>
        <p className="lede">Short pieces behind the one-line notes the app shows you. Each one belongs to a practice and points at a screen.</p>
        <div className="cards" style={{ marginTop: 26 }}>
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="card">
              <span className="kicker">{PRACTICES[p.practice].name}</span>
              <div className="t">{p.title}</div>
              <div className="x">{p.excerpt}</div>
              <div className="m">{p.minutes} min read</div>
            </Link>
          ))}
        </div>
        <div className="cta">
          <div className="h">See it on your own numbers.</div>
          <p>Every article fills in your lowest point, your next paycheck and your streak when you are signed in.</p>
          <Link href="/app">Open the calendar</Link>
        </div>
      </div>
    </div>
  );
}
