// The Flowy Cash Method: the longer articles the in-app encouragement lines
// link to. Plain Markdown subset (see src/lib/md.ts). Bodies may include
// {{lowest}}, {{lowestDate}}, {{nextIncome}}, {{nextIncomeDate}},
// {{greenDays}} which the post page fills from the signed-in reader's own
// calendar, or with sample numbers when signed out.

export type Practice = "know" | "place" | "look" | "move" | "catchup" | "all";

export interface Post {
  slug: string;
  title: string;
  practice: Practice;
  excerpt: string;
  date: string; // YYYY-MM-DD
  minutes: number;
  body: string;
}

export const PRACTICES: Record<Practice, { name: string; line: string }> = {
  know: { name: "Know", line: "Start from the real number." },
  place: { name: "Place", line: "Put every dollar on a day." },
  look: { name: "Look ahead", line: "Find the lowest point, not the total." },
  move: { name: "Move", line: "Fix it before it bites." },
  catchup: { name: "Catch up", line: "Coming back is the practice." },
  all: { name: "The method", line: "Your bank records the past. Your calendar plans the future." },
};

export const POSTS: Post[] = [
  {
    slug: "two-clocks",
    title: "Two clocks: your bank records the past, your calendar plans the future",
    practice: "all",
    excerpt: "Most money fear lives in the gap between what already happened and what you think will happen. Close the gap every morning and the fear has nowhere to live.",
    date: "2026-11-24",
    minutes: 4,
    body: `
There are two clocks on your money and they do not tell the same time.

The first is your bank. It is a record. Every number in it is about something that already happened: a paycheck that landed, a card that was charged, a transfer that cleared. The bank is never wrong about the past and it has nothing to say about the future. It cannot tell you whether rent is covered on the first, because the first has not happened yet.

The second clock is your calendar. It is a plan. Every number in it is about something that has not happened yet: the paycheck on Friday, the car payment on the fifth, the groceries on Thursday. The calendar is a guess, a good one if you keep it honest, and it is the only one of the two that can answer the question you actually have, which is some version of "am I going to be okay."

## Where the fear comes from

Fear shows up in the gap between the clocks. You know the bank has moved since you last looked. You do not know by how much. Your plan was made from a number that is now stale, so every day ahead is a little less trustworthy than it was, and the longer you wait the wider the gap gets. Three weeks in, you are not avoiding your money because you are lazy. You are avoiding it because looking means finding out how wrong the plan has become.

## Closing the gap

The method does one thing about this. Every morning, the bank's number becomes the calendar's starting point. That is all a balance reset is: today's cell takes the real number, and every day after it is recomputed from there. The plan is corrected before you have had coffee.

Once the two clocks agree on today, the future stops being scary in the particular way it was. It might still be tight. The lowest point ahead might be {{lowest}} on {{lowestDate}}. But tight is a fact you can move things around, and a fact is not a fear.

## What this asks of you

Ten seconds. Look at the morning line, glance at the lowest point, close the app. On the days the bank sends something the calendar did not expect, one question: is this a one-off or will it come back. That is the whole practice.

The bank will keep recording. The calendar will keep planning. Your job is just to let them meet, once a day, so neither one has to carry the other's weight.
`,
  },
  {
    slug: "guess-before-you-look",
    title: "Guess before you look: the ten-second habit that kills money dread",
    practice: "know",
    excerpt: "Before you open the bank, say a number. Being close is good news. Being far off is better news, because now you know which way your sense of your money is bent.",
    date: "2026-11-24",
    minutes: 3,
    body: `
Before you open the bank app, say a number out loud. What do you think is in checking right now?

Do this every time, for a month, and something changes. Not the balance. You.

## Why the guess matters more than the answer

The dread you feel about looking is not about the number. It is about not knowing the number. Your mind fills the blank with the worst version, because that is what minds do with blanks. A guess takes the blank away. Even a bad guess gives the fear something specific to argue with, and specific fear is a fraction of the size of vague fear.

Then you look, and one of three things is true.

**You were close.** Within fifty dollars, within five percent. This is the quiet win most people never notice they have earned. It means your sense of your own money is good, that the calendar and your gut agree, and that you can trust the feeling of "fine" when you have it.

**You guessed high.** The real number is lower than you thought. This is useful, not shameful. It usually means a few small things are leaking that you have stopped seeing: the subscription, the coffee, the delivery fee. The bank list in Connect bank will show you which.

**You guessed low.** The real number is higher. You have been carrying more worry than the money justified. Notice that. It is the clearest evidence you will get that the fear was running ahead of the facts.

## In the app

Catch up asks for the guess first, on purpose, before it shows you anything. After you enter the real balance it puts the two side by side with the difference. Over time those differences are the most honest measure of money peace you can have: not how much you have, but how well you know how much you have.

Seneca wrote that we suffer more often in imagination than in reality. The guess is how you find out, in ten seconds, which one you are in this morning.
`,
  },
  {
    slug: "a-bill-without-a-day",
    title: "A bill without a day is a worry. A bill on the 13th is a fact.",
    practice: "place",
    excerpt: "Categories tell you where money went. Dates tell you whether it will be there. The calendar wins because it answers the question you are actually asking.",
    date: "2026-11-24",
    minutes: 3,
    body: `
Every budgeting app you have tried sorted your money into categories. Housing, food, transport, fun. It felt organized. It did not make you feel better, and here is why.

A category is a bucket with no time in it. "Utilities: $310" tells you what utilities cost. It does not tell you whether the electric bill lands before or after the paycheck, and that is the only thing that decides whether the 18th is a normal day or a bad one.

## Put it on a day

The method asks one thing of every dollar you expect to spend or receive: give it a date. Not a month, a day. Rent is not "housing," it is the first. The car payment is not "transport," it is the fifth. Groceries are not a monthly figure, they are Thursdays.

Once every item has a day, two things happen without any further effort. First, the balance on every day ahead becomes computable, so the calendar can show you the footer number under each day and the lowest one in the header. Second, every item becomes movable. A bill on the 13th can be dragged to the 16th. A bill in a category cannot be dragged anywhere.

## The worry disappears into the fact

A bill without a day is a small background hum: I owe that, when is it, do I have it. A bill on the 13th is silent. It is either covered on the 13th or it is not, and the calendar already knows which. If it is not, the cell goes red and you have until the 13th to do something about it. The hum is gone either way.

## What to do with the odd ones

Some things do not have a natural day. Put them on the day you usually pay them, or on payday, or spread them with Distribute a debt. The exact day matters less than having one. You can always drag it later. What you cannot do is plan around a number that floats.

Start with the next thirty days. Paychecks first, then anything over a hundred dollars, then the rest as it occurs to you. Thirty days of dated items is enough for the calendar to start telling the truth.
`,
  },
  {
    slug: "find-the-lowest-point",
    title: "Find the lowest point, not the total",
    practice: "look",
    excerpt: "Your balance today is the least useful number on the screen. The one that matters is the worst day in the next 45, and whether it is above zero.",
    date: "2026-11-24",
    minutes: 4,
    body: `
Open any bank app and the biggest number on the screen is today's balance. It is the number everyone watches and it is close to meaningless for planning, because it is one point on a line that is about to move.

What you want is the shape of the line.

## The dip

Between now and your next few paychecks, your balance will rise and fall. Somewhere in that stretch there is a day when it is lowest, usually the day before a paycheck, right after rent or the car payment has cleared. That day is the dip. The dip is the whole story. If the dip is above zero, the next few weeks are handled and everything you do between now and then is optional. If the dip is below zero, you have a specific problem on a specific day, which is the best kind of problem to have because it can be moved.

Yours right now is **{{lowest}} on {{lowestDate}}**. {{lowestVerdict}}

## Why people miss it

Because it is not today. Today's balance looks fine, the dip is eleven days out, and nothing on a normal bank screen points at it. You find out about the dip when you are standing in it. The calendar's job is to find it for you in advance and put it in the header, labeled Low, so it is the first number you see rather than the last.

## What to do with it

If the dip is comfortably above zero, nothing. Enjoy the boring month.

If it is close to zero, look at the three or four days before it and ask which item could move past the next paycheck. Usually there is one. Drag it. Watch the Low number change. That is the entire skill, and it takes about four seconds.

If it is well below zero, that is what Distribute a debt and the sparkle box are for: spread the thing, or ask "what can I move to get November above zero," and apply what it proposes.

## The habit

Stop checking your balance. Start checking your dip. Once a day, the Low pill in the header, and the date next to it. Everything else on the screen is supporting detail.
`,
  },
  {
    slug: "why-red-days-are-a-gift",
    title: "Why red days are a gift",
    practice: "move",
    excerpt: "A red day three weeks out is the calendar doing exactly what you built it for. You have three weeks. Most people get three hours.",
    date: "2026-11-24",
    minutes: 3,
    body: `
When a day on the calendar turns red, the first feeling is a small drop in the stomach. That is the old reflex, from years of finding out about overdrafts after they happened. It is worth replacing, because a red day on this calendar is the opposite of that.

## What a red day actually says

It says: on this date, if nothing changes, the balance will be below zero. If nothing changes. The date is in the future, usually weeks away, and the sentence has a condition on it. The calendar is not reporting a failure. It is reporting a forecast early enough that it does not have to come true.

Compare that to the alternative, which is the bank telling you about it in the form of a $35 fee on the day. The red cell is the same information, delivered with time still on the clock.

## Three weeks is a lot of time

Almost every red day has a cheap fix if you see it early. Move one payment to the other side of the paycheck. Shift the dog walker from the 25th to the 28th. Split the insurance into two halves across two paydays. None of these are hardships; they are rearrangements, and the calendar lets you try them by dragging. The cell goes green, the Low number in the header goes up, and you are done.

The same red day found on the morning of is a very different thing: a transfer from savings, a call to someone, a fee.

## How to treat the red

Treat it like a reminder, not a verdict. When one appears:

1. Look at the date. Count the days you have.
2. Look at the items on that day and the two or three before it. Find the one that could move.
3. Drag it past the next paycheck. Check the Low pill.
4. If nothing can move, ask the sparkle box what it would do, and apply the plan or spread the lump.

Then stop. One red day fixed is a good morning. You do not need to optimize the rest of the month.

## The reframe

A calendar that never shows red is either very comfortable or not honest. A calendar that shows red three weeks out and lets you clear it in four seconds is doing its job. The gift is the three weeks.
`,
  },
  {
    slug: "the-three-week-slump",
    title: "The three-week slump, and why coming back is the whole skill",
    practice: "catchup",
    excerpt: "Everyone stops looking. The method does not ask you never to. It asks you to make coming back cheap, specific, and free of judgment.",
    date: "2026-11-24",
    minutes: 4,
    body: `
Here is the pattern, and if you recognize it, good, because it means you are normal.

You set up the calendar. For a week or two you check it every morning and it feels great. Then a busy stretch, a trip, a bad week, and you miss a day. Then three. The longer you stay away the more certain you are that the calendar is now wrong, which makes opening it feel worse, which keeps you away longer. Three weeks later you are avoiding an app that was built to make you feel calm.

This is not a character flaw. It is how avoidance works, and every budgeting system that pretends it will not happen to you is lying.

## Design for the return

The method accepts the slump as a given and spends its effort on the return. The question is not "how do I never fall off" but "how cheap can I make coming back."

Catch up is the answer. It is a short guided check-in that does the catching up for you, in the order that takes the fear apart:

1. **Guess** your balance before you look. Vague dread becomes a number.
2. **Confirm** the large items the calendar expected while you were gone. Mark what did not happen or changed. This is where most of the "wrongness" lives, and it is usually three or four items.
3. **Enter the real balance**, or read it straight from the bank. The plan snaps to reality.
4. **Read where you stand**: the lowest point ahead, the next paycheck, and a few plain sentences about whether things are fine, tight, or a problem on a specific date.

Two minutes. No scolding anywhere in it. The banner that invites you in says "no judgment" and means it.

## Why no judgment is a design decision

Shame is the fuel of avoidance. An app that greets your return with a red streak counter or a list of everything you missed is training you to stay away next time. The method trains the opposite reflex: come back, get the real number, see the dip, done. The fastest return wins.

## What to expect after a few returns

The slumps get shorter. Not because you become disciplined, but because the return stops being scary. Once you have come back from three weeks twice and found that it took two minutes and the news was mostly fine, the third slump ends at four days instead of twenty-one. That is the whole arc. Coming back is the practice, and it gets easier every time you do it.
`,
  },
  {
    slug: "what-a-boring-month-means",
    title: "What a boring month means",
    practice: "all",
    excerpt: "Thirty days above zero and nothing to report is not nothing. It is the goal, and it is worth noticing on purpose.",
    date: "2026-11-24",
    minutes: 2,
    body: `
Some month soon you will open the calendar and there will be nothing to do. Every day green, the morning line saying "balance updated, nothing to do," the lowest point comfortably above zero, no unknown charges to sort.

It will feel like nothing happened. Notice it anyway.

## The thing you were actually after

Nobody wants a budgeting app. People want the feeling of a boring month: no surprises, no scramble before payday, nothing hanging over the 25th. The whole method, every practice in it, is in service of producing that feeling as often as possible and letting you recognize it when it arrives.

A boring month is evidence. It says the paychecks and bills are placed on the right days, the lowest point was found and was fine, nothing needed moving, and the bank and the calendar agreed every morning. That is a lot of things going right quietly.

## Count them

The calendar keeps the count without any effort from you: {{greenDays}} days in a row above zero as of today. Streaks on a calendar are a small, honest kind of pride, the kind that comes from the numbers rather than from a badge.

## What to do with a boring month

Mostly nothing. Maybe put something on a payday that you have been meaning to: a savings line, a debt chunk, a thing you wanted. A boring month is the only time it is safe to add a want to the calendar and watch the Low number stay green.

Then close the app and go have your day. That was the point.
`,
  },
  {
    slug: "three-kinds-of-unknown-charge",
    title: "Candy bars, vet bills, and Synchrony: three kinds of unknown charge",
    practice: "place",
    excerpt: "When the bank shows a charge the calendar has never heard of, it is one of three things. Each gets a different answer, and none of them is panic.",
    date: "2026-11-24",
    minutes: 3,
    body: `
Once the bank is connected, some mornings the calendar will say: these charges posted, and none of them are on your plan. The list can look alarming. It is not. Every one of those charges is already inside today's balance, so nothing is wrong. The only question is what, if anything, to do about each going forward.

There are three kinds.

## Noise

The candy bar. The coffee. The parking meter. Small, irregular, and already absorbed by the balance. Adding these to the calendar one by one would bury the plan under chips that mean nothing. The answer is **Ignore**: leave it in the balance, no line. If one of them keeps showing up, like a daily coffee, it is better as a single weekly "Coffee" line than as twenty chips.

## Repeaters

Synchrony Bank, $79, on the 23rd. And again last month on the 23rd. And the month before. This is a bill that was never put on the calendar, and every month it quietly dents the dip. The answer is **Add monthly**: it becomes an expected item on its day, and the lowest point ahead moves to account for it. The calendar will even tell you by how much.

## Big one-offs

The vet. The car repair. The plane ticket. These will not recur, but they explain why the month ran short, and in December you will want to see them. The answer is **Add once**: a single item on the day it posted. Nothing ahead changes; the past just gets its label.

## The rule of thumb

Under your noise line and never seen before: ignore. Same amount, same day, more than twice: monthly. Large and new: once. The Connect bank panel lists each unknown with those three buttons, and the morning version of it will suggest the answer so you only have to disagree.

What you should never do is add everything or add nothing. Everything makes the calendar a diary. Nothing lets the Synchronys of the world hide in the balance forever.
`,
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
