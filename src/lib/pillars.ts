/*
  Content pillars — the brand messages every post / draft / image carries
  one of.

  Since migration 0006 the pillars are ROWS (`Pillar` table), edited on
  /admin/essence. This module is the client-safe half: the type, the code
  DEFAULTS (the FlowyCash four, also the no-database fallback
  and what the migration seeded), the tag palette and the prompt helpers.
  It imports nothing server-side, so client components may use it.

  Reading pillars:
    server   src/lib/pillarStore.ts  → loadPillars() / findPillar() (DB, active
             only, by sortOrder; DEFAULT_PILLARS without a database)
    browser  src/components/usePillars.ts → usePillars() (GET /api/admin/pillars)

  Rows only store the `id` (BlogPost.pillarId, SocialDraft.pillarId,
  UploadedImage.pillarId), so renaming a pillar never touches them.
*/

/** A pillar id is its slug (e.g. "seeit"); it's whatever the editor saved. */
export type PillarId = string;

export interface Pillar {
  id: PillarId;
  name: string;
  /** One line: the brand message this pillar carries. */
  message: string;
  /** Angle prompts — starting points for a title or a caption. */
  angles: string[];
  /** Default hashtags (Instagram mainly; the others get at most 2–3). */
  hashtags: string[];
  /** Target share of the content mix, in percent (null = unset). */
  target: number | null;
  sortOrder: number;
  active: boolean;
}

export const BRAND_ESSENCE = {
  line: "Know your money before it moves.",
  purpose:
    "Put every dollar coming in and going out on a calendar so people see their running balance day by day and catch the negative days before they happen.",
  promise:
    "A cashflow calendar you can read at a glance: drag an expense to fix a shortfall, know what's fixed and what's flexible, get plain advice when a month runs tight, and keep your data yours. Free to start; Pro is $9/month.",
  doList: [
    "Plain, calm money talk — no shame, no hype",
    "Show the calendar; the visual is the pitch",
    "Concrete scenarios: rent on the 1st, paycheck on the 15th, the credit-card day",
    "Teach one small habit per post",
    "Respect the reader's time and intelligence",
  ],
  dontList: [
    "Get-rich or 'hack' framing",
    "Fear-mongering about debt",
    "Jargon (APR tables, net worth spreadsheets)",
    "Comparing users to each other",
    "Promising returns or financial advice",
  ],
} as const;

/** The seed / no-database pillars (what scripts/seed-creator.ts upserts). */
export const DEFAULT_PILLARS: Pillar[] = [
  {
    id: "seeit",
    name: "See it coming",
    message: "Spot negative days before they happen — your balance, day by day",
    angles: [
      "The day the balance dips below zero — and how far ahead you can see it",
      "Rent on the 1st, paycheck on the 15th: the two-week gap, drawn out",
      "What a running balance shows that an account balance hides",
      "The credit-card day: why it surprises people and how a calendar stops that",
      "One red day on the calendar, and the three ways to clear it",
    ],
    hashtags: ["#FlowyCash", "#CashflowCalendar", "#KnowYourMoney", "#SeeItComing"],
    target: 30,
    sortOrder: 0,
    active: true,
  },
  {
    id: "calendar",
    name: "Money on a calendar",
    message: "Every dollar in and out on the month you actually live in — not a spreadsheet",
    angles: [
      "Why a month on a calendar reads faster than any budget spreadsheet",
      "Fixed vs. flexible: tagging what has to leave and what can move",
      "Dragging a bill to a different day and watching the month change",
      "Paychecks, subscriptions, the weekly grocery run — all on one grid",
      "The month-end note: what you learned, written where you'll see it next month",
    ],
    hashtags: ["#FlowyCash", "#CashflowCalendar", "#MoneyOnACalendar", "#PersonalFinance"],
    target: 25,
    sortOrder: 1,
    active: true,
  },
  {
    id: "habits",
    name: "Small habits",
    message: "One calm money habit at a time: autopay tags, moving a bill, a weekly glance",
    angles: [
      "The Sunday glance: two minutes that make the week predictable",
      "Marking a bill autopay so you stop re-checking it",
      "Moving one due date to land after payday — once, for good",
      "A reminder the morning a big expense hits, not the day after",
      "Why one habit beats a whole budgeting system you'll abandon",
    ],
    hashtags: ["#FlowyCash", "#SmallHabits", "#KnowYourMoney", "#MoneyHabits"],
    target: 25,
    sortOrder: 2,
    active: true,
  },
  {
    id: "yours",
    name: "Your data, your control",
    message: "Export anytime, no bank login required, free to start",
    angles: [
      "No bank login: why typing in your own numbers is a feature",
      "Export to CSV whenever you like — the data is yours, full stop",
      "Free to start; what Pro adds and what it costs ($9/month)",
      "Sharing a read-only view with a partner without handing over a password",
      "What we don't collect, and why",
    ],
    hashtags: ["#FlowyCash", "#YourData", "#KnowYourMoney", "#PrivacyFirst"],
    target: 20,
    sortOrder: 3,
    active: true,
  },
];

/** Slug rule for a pillar id: lowercase letters, digits, dashes; 2–40 chars. */
export function slugifyPillarId(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function isValidPillarId(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9][a-z0-9-]{1,39}$/.test(v);
}

/** A pillar id off the wire: the string when it looks like one, else null. */
export function cleanPillarId(v: unknown): string | null {
  return isValidPillarId(v) ? v : null;
}

/** Find a pillar in a list — tolerates unknown / legacy ids. */
export function pillarIn(list: Pillar[], id: string | null | undefined): Pillar | null {
  if (!id) return null;
  return list.find((p) => p.id === id) ?? null;
}

/** Tailwind classes for the small pillar tag — one tint per slot, cycling. */
export const PILLAR_TAG_PALETTE: string[] = [
  "bg-accent-soft text-accent-strong",
  "bg-sea-soft text-sea",
  "bg-sun-soft text-sun",
  "bg-berry-soft text-berry",
];

export function pillarTagCls(index: number): string {
  return PILLAR_TAG_PALETTE[((index % PILLAR_TAG_PALETTE.length) + PILLAR_TAG_PALETTE.length) % PILLAR_TAG_PALETTE.length];
}

/** The tag classes for an id within a list (its slot in display order). */
export function pillarTagClsFor(list: Pillar[], id: string | null | undefined): string {
  const i = list.findIndex((p) => p.id === id);
  return pillarTagCls(i < 0 ? 0 : i);
}

/* ───────── prompt helpers (server routes) ───────── */

/** The brand essence as a labelled block for a system prompt. */
export function essencePrompt(): string {
  return [
    `BRAND LINE: ${BRAND_ESSENCE.line}`,
    `PURPOSE: ${BRAND_ESSENCE.purpose}`,
    `PROMISE: ${BRAND_ESSENCE.promise}`,
    `DO: ${BRAND_ESSENCE.doList.join("; ")}`,
    `DON'T: ${BRAND_ESSENCE.dontList.join("; ")}`,
  ].join("\n");
}

/** One pillar as a labelled block — the message plus its angle prompts. */
export function pillarPrompt(p: Pillar): string {
  return [
    `PILLAR: ${p.name}`,
    `MESSAGE IT CARRIES: ${p.message}`,
    `ANGLES TO DRAW FROM:`,
    ...p.angles.map((a) => `- ${a}`),
    `DEFAULT HASHTAGS: ${p.hashtags.join(" ")}`,
  ].join("\n");
}
