/**
 * Site identity used by the creator page (admin) — prompts, newsletter
 * footer, absolute image URLs that Meta fetches, and the stock-image
 * user agent. The public app does not read this file.
 */
export const site = {
  name: "FlowyCash",
  domain: "flowycash.com",
  // The www host answers; the apex redirects to it. Absolute URLs that
  // leave the site (social captions, /api/images/<id> for Meta) use this.
  url: "https://www.flowycash.com",
  description:
    "A personal cashflow calendar: every dollar in and out on the month you actually live in, with your running balance day by day.",
  email: "hello@flowycash.com",
} as const;
