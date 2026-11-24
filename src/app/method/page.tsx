import Link from "next/link";
import type { Metadata } from "next";
import { POSTS, PRACTICES, type Practice } from "@/content/posts";
import { QUOTES } from "@/content/quotes";
import "../blog/blog.css";

export const metadata: Metadata = {
  title: "The Flowy Cash Method",
  description: "Your bank records the past. Your calendar plans the future. Five practices, each one a screen in the app.",
};

const ORDER: Practice[] = ["know", "place", "look", "move", "catchup"];
const DETAIL: Record<Practice, { d: string; screen: string }> = {
  know: { d: "One balance, one morning, before you plan anything. Guess first; it trains your sense of your own money.", screen: "Today's reset chip, the morning line, Catch up." },
  place: { d: "Not a category, a date. A bill without a day is a worry; a bill on the 13th is a fact you can move.", screen: "The calendar, the + on each day, Add once from the bank list." },
  look: { d: "The number that matters is the worst day in the next 45 and whether it is above zero. Everything else is detail.", screen: "The Low pill in the header, the 45-day verdict." },
  move: { d: "A red day three weeks out is a gift. Drag one payment past payday and it turns green. That is the entire skill.", screen: "Drag and drop, the sparkle box, Distribute a debt." },
  catchup: { d: "Everyone falls off. The method does not ask you never to; it asks you to make coming back cheap and judgment-free.", screen: "Catch up and the 14-day banner." },
  all: { d: "", screen: "" },
};

export default function MethodPage() {
  const byPractice = (p: Practice) => POSTS.filter((x) => x.practice === p);
  const seneca = QUOTES[0];
  return (
    <div className="fc-blog">
      <div className="wrap">
        <div className="top">
          <Link href="/" className="brand">flowycash</Link>
          <nav className="nav"><Link href="/blog">Articles</Link><Link href="/app">Open the calendar</Link></nav>
        </div>
        <span className="kicker">The Flowy Cash Method</span>
        <h1>Your bank records the past. Your calendar plans the future.</h1>
        <p className="lede">Money fear lives in the gap between what already happened and what you think will happen. The method closes that gap every morning in about ten seconds, so the fear has nowhere to live. Five practices. Each one is a screen you already have.</p>

        <div className="quote" style={{ marginTop: 22 }}>
          <div className="q">&ldquo;{seneca.text}&rdquo;</div>
          <div className="a">{seneca.who} · {seneca.source}</div>
        </div>

        <div className="practices">
          {ORDER.map((p, i) => (
            <div className="pr" key={p}>
              <div className="n">{i + 1} · {PRACTICES[p].name}</div>
              <div className="l">{PRACTICES[p].line}</div>
              <div className="d">{DETAIL[p].d}</div>
              <div className="d" style={{ color: "#94a3b8" }}>Screen: {DETAIL[p].screen}</div>
              {byPractice(p).map((x) => <Link key={x.slug} href={`/blog/${x.slug}`}>{x.title} →</Link>)}
            </div>
          ))}
        </div>

        <article>
          <h2>How it shows up in the app</h2>
          <p>Not as a lesson. As one line, in the moment, once. When a red day first appears, when you come back after a few weeks away, when your guess lands close to the real balance, the calendar says a sentence and offers the longer article. Dismiss it and it stays quiet about that situation for a month.</p>
          <p>Signed in, the articles read from your own calendar: your lowest point, your next paycheck, your streak of days above zero. The claim and the proof sit in the same sentence.</p>
          <h2>What it is not</h2>
          <p>It is not a budget by category, a spending report, or a score. There is no streak to break and nothing to be behind on. The only measure is whether the two clocks agree this morning, and the only skill is coming back when they do not.</p>
        </article>

        <div className="cta">
          <div className="h">Start with the next thirty days.</div>
          <p>Paychecks first, then anything over a hundred dollars. The calendar starts telling the truth about a week in.</p>
          <Link href="/app">Open the calendar</Link>
        </div>
      </div>
    </div>
  );
}
