// Quotes on fear and money. Every entry carries its source; anything that
// cannot be traced to a page is marked attributed:true and shown that way.

export type Mood = "tight" | "fine" | "catchup" | "small" | "debt" | "saving" | "any";

export interface Quote {
  text: string;
  who: string;
  source: string;
  attributed?: boolean;
  mood: Mood[];
  post?: string; // slug of the article it belongs to
}

export const QUOTES: Quote[] = [
  { text: "We suffer more often in imagination than in reality.", who: "Seneca", source: "Letters to Lucilius, 13", mood: ["catchup", "tight", "any"], post: "guess-before-you-look" },
  { text: "It is not the man who has too little, but the man who craves more, that is poor.", who: "Seneca", source: "Letters to Lucilius, 2", mood: ["fine", "any"], post: "what-a-boring-month-means" },
  { text: "Wealth consists not in having great possessions, but in having few wants.", who: "Epictetus", source: "Discourses tradition", mood: ["fine", "any"] },
  { text: "Beware of little expenses; a small leak will sink a great ship.", who: "Benjamin Franklin", source: "Poor Richard's Almanack", mood: ["small", "any"], post: "three-kinds-of-unknown-charge" },
  { text: "Annual income twenty pounds, annual expenditure nineteen nineteen six, result happiness. Annual income twenty pounds, annual expenditure twenty pounds ought and six, result misery.", who: "Charles Dickens", source: "David Copperfield, Mr. Micawber", mood: ["tight"], post: "find-the-lowest-point" },
  { text: "The cost of a thing is the amount of what I will call life which is required to be exchanged for it, immediately or in the long run.", who: "Henry David Thoreau", source: "Walden", mood: ["any"], post: "a-bill-without-a-day" },
  { text: "The plans of the diligent lead surely to abundance, but everyone who is hasty comes only to poverty.", who: "Proverbs 21:5", source: "Hebrew Bible", mood: ["debt", "saving", "any"], post: "a-bill-without-a-day" },
  { text: "Do not save what is left after spending, but spend what is left after saving.", who: "Warren Buffett", source: "widely repeated, unsourced", attributed: true, mood: ["saving"] },
  { text: "Fear is the mind-killer.", who: "Frank Herbert", source: "Dune", mood: ["catchup"], post: "the-three-week-slump" },
  { text: "What we fear doing most is usually what we most need to do.", who: "Timothy Ferriss", source: "The 4-Hour Workweek", attributed: true, mood: ["catchup"], post: "the-three-week-slump" },
  { text: "He who is not contented with what he has, would not be contented with what he would like to have.", who: "Socrates", source: "as reported in later collections", attributed: true, mood: ["fine"] },
  { text: "A budget is telling your money where to go instead of wondering where it went.", who: "John C. Maxwell", source: "often attributed; also credited to Dave Ramsey", attributed: true, mood: ["any"], post: "two-clocks" },
];

// One quote per day, stable for the day, biased toward the current mood.
export function quoteForDay(mood: Mood, dateKey: string): Quote {
  const pool = QUOTES.filter((q) => q.mood.includes(mood));
  const list = pool.length ? pool : QUOTES;
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}
