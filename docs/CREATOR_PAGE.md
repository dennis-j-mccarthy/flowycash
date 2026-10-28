# Creator page (`/admin`)

The creator page is FlowyCash's content system: brand essence and pillars,
a Claude-powered blog generator, an image library stored in Postgres, a
social post maker that publishes to the Facebook Page through the Meta
Graph API, and a newsletter maker. It was ported from the `built-with-ai`
repo; file and route names were kept so the two stay symmetric.

It is unlisted (robots `noindex`, not linked from the app) and gated by a
passcode, not by Clerk. `src/proxy.ts` lets `/admin`, `/api/admin` and
`/api/images` bypass the Clerk middleware.

## Routes

| Page | What it does |
| --- | --- |
| `/admin` | Redirects to `/admin/blog`. |
| `/admin/essence` | Brand line, purpose, promise, do / don't lists, three voice sliders, the tone brief and the pillars editor. Every generator reads this. |
| `/admin/blog` | Blog generator: pillar → title ideas → write a full draft with Claude. Drafts are saved as `BlogPost` rows. |
| `/admin/blog/posts` | Blogs: edit, pick a hero image from the library, publish / unpublish, delete. Publishing writes four social drafts (Facebook, Instagram, LinkedIn, X). |
| `/admin/library` | Library: every image, grouped by collection, tagged with a pillar and a credit line. Upload (JPEG/PNG/WebP, 4 MB cap), or search Unsplash / Pexels / Pixabay / Openverse and import. Bytes live in Postgres (`UploadedImage`). |
| `/admin/social` | Post maker: image → platform → pillar → caption → preview → publish or schedule to the Facebook Page. Below it: the drafts picker and the queue (cancel scheduled posts). |
| `/admin/email` | Email maker: a newsletter (subject lines, preheader, HTML + text) from one to three published posts. No ESP is wired; copy or download the HTML. |

The passcode is entered once per browser and remembered in `localStorage`
(`flowycash-admin-pass`). The server is the real gate: every `/api/admin/*`
route checks `ADMIN_PASSCODE` against the JSON body's `passcode` or the
`x-admin-passcode` header.

### API

All under `/api/admin/*` and passcode-gated unless noted.

- `GET /api/admin/essence`, `PUT` — the `BrandEssence` singleton.
- `GET|POST /api/admin/pillars`, `PATCH|DELETE /api/admin/pillars/[id]`.
- `POST /api/admin/blog/titles`, `POST /api/admin/blog/write` — Claude.
- `GET|POST /api/admin/blog/posts`, `GET|PATCH|DELETE /api/admin/blog/posts/[id]` (PATCH with `action: publish | unpublish | regenerate-social`, or plain field edits).
- `GET|PUT /api/admin/blog/tone`.
- `GET /api/admin/images` (list + collections), `POST /api/admin/images/upload` (multipart), `POST /api/admin/images/import` (fetch a URL into the library), `GET /api/admin/images/search` (stock providers), `POST /api/admin/images/select` (provider download tracking), `GET /api/admin/images/suggest` (search terms for a post), `GET|PATCH|DELETE /api/admin/images/[id]`.
- `POST /api/admin/social/captions` — Claude caption for the maker.
- `GET /api/admin/social/drafts`, `PATCH|DELETE /api/admin/social/drafts/[id]`.
- `GET /api/admin/social/queue`, `POST` (cancel a scheduled post).
- `POST /api/admin/fbpost` — `{ action: "config" }` reports the Meta connection; `publish` / `schedule` post to the Page.
- `GET /api/admin/email`, `POST /api/admin/email/generate`, `GET|PATCH|DELETE /api/admin/email/[id]`.
- **Public, no passcode:** `GET /api/images/[id]` serves library bytes with a one-year immutable cache. Meta fetches post images from this URL, so it must stay public.

Every route checks `isDatabaseConfigured()` (`src/lib/prisma.ts`, which
reads `DIRECT_DATABASE_URL`) and answers with a sentence instead of a 500
when the database is missing.

## Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `ADMIN_PASSCODE` | Vercel Production + `.env.local` | The gate for `/admin` and `/api/admin/*`. Rotate by changing it in both places. |
| `ANTHROPIC_API_KEY` | Vercel Production + `.env.local` | Blog titles / drafts, captions, newsletter copy, image-search suggestions. Without it the generators fall back to deterministic text where they can and say so where they can't. |
| `DIRECT_DATABASE_URL` | Vercel Production + `.env.local` | Runtime Postgres connection (the app's existing variable; the creator page shares it). |
| `DATABASE_URL` | Vercel Production + `.env.local` | Prisma CLI connection (`prisma db push`). |
| `META_PAGE_ID` + `META_PAGE_TOKEN` | Vercel Production | Facebook Page id and a long-lived Page access token. Both must be set together. |
| `META_PAGE_NAME` | optional | Display name shown in the Post maker. |
| `META_IG_USER_ID` (+ `META_IG_USERNAME`) | optional | Instagram Business account linked to the Page; enables Instagram publishing. |
| `META_GRAPH_VERSION` | optional | Graph API version (default `v21.0`). |
| `FB_PAGE_ID` + `FB_PAGE_TOKEN` | optional fallback | Accepted when the `META_*` pair is not set. |
| `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY` | optional | Stock-image search providers; Openverse needs no key. |

Note: `DATABASE_URL` and `DIRECT_DATABASE_URL` are stored as **sensitive**
variables in Vercel, so `vercel env pull` writes them as empty strings.
Copy them from an existing local env file instead.

## Connecting Meta (the FlowyCash Facebook Page, id 1526373990549266)

1. In Meta for Developers, create or open an app that has `pages_manage_posts`,
   `pages_read_engagement` and (for Instagram) `instagram_content_publish`.
2. In the Graph API Explorer, get a User token with those permissions, then
   exchange it for a long-lived token, then call
   `GET /me/accounts` with it to get the **Page access token** for the
   FlowyCash Page. A Page token derived from a long-lived user token does not expire.
3. Set in Vercel Production: `META_PAGE_ID=1526373990549266`,
   `META_PAGE_TOKEN=<page token>`, optionally `META_PAGE_NAME=FlowyCash`.
4. Redeploy. The Post maker's header switches from "Facebook isn't connected"
   to the Page name, and `POST /api/admin/fbpost {"action":"config"}` returns
   `connected: true`.

Until then the Post maker still writes captions and saves drafts; only
publish / schedule is disabled.

## Database

Models added to `prisma/schema.prisma` (copied verbatim from the source):
`BlogPost`, `SocialDraft`, `UploadedImage`, `Pillar`, `BlogSettings`,
`BrandEssence`, `EmailDraft`. The app's own models are untouched. There is
no migrations directory; apply changes with

```
npx prisma db push      # needs DATABASE_URL in the env
npx prisma generate
```

## Seeding

```
npx tsx scripts/seed-creator.ts            # reads .env.local
```

Idempotent (upserts / skip-if-present). It writes the FlowyCash essence
("Know your money before it moves."), the four pillars (`seeit`,
`calendar`, `habits`, `yours`), the tone brief, and the library: the two
logos from `public/` (collection `brand`) and two Unsplash-licensed concept
photos (collection `concepts`) fetched from the owner's other library.

## Differences from the source repo

- The blog is DB-only: there is no `content/blog` Markdown and no public
  `/blog` page yet. Social captions and the newsletter link to
  `https://www.flowycash.com/blog/<slug>`, so add a public blog route
  before publishing posts externally.
- The Vercel Blob upload fallback was removed (Blob is suspended on this
  account); uploads always go to Postgres.
- AI failures are logged (`src/lib/alert.ts`) rather than emailed.
- Studio and the content calendar were not ported.
