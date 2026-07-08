# flowycash -- Personal Cashflow Calendar

Visual cashflow forecasting on a calendar. Track recurring income/expenses, see daily running balances, manage autopay, and forecast months ahead.

**Production:** https://flowycash.com

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.2 |
| Language | TypeScript | ^5 |
| UI | React | 19.2.4 |
| Styling | Tailwind CSS | ^4 |
| Database | PostgreSQL (Prisma Postgres cloud) | -- |
| ORM | Prisma (with `@prisma/adapter-pg`) | 7.6.0 |
| Auth | Clerk (`@clerk/nextjs`) | ^7.0.8 |
| Payments | Stripe | ^22.0.0 |
| Hosting | Vercel | -- |

## Local Development

```bash
npm install          # also runs `prisma generate` via postinstall
./start.sh           # starts local Prisma Postgres DB, seeds if empty, auto-backs up, runs dev server
```

Or manually:

```bash
npx prisma dev &     # start local Prisma Postgres on port 51214
npm run dev           # Next.js dev server on port 3000
```

**Dev server runs on port 3000.**

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `./start.sh` | Full local startup (DB + seed + backup + dev server) |

## Environment Variables

**File:** `.env` (not committed -- add manually)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Prisma Postgres accelerate URL (`prisma+postgres://accelerate.prisma-data.net/?api_key=...`) |
| `DIRECT_DATABASE_URL` | Yes | Direct PostgreSQL connection string (used by `src/lib/prisma.ts` for queries) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (`pk_live_...`) |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key (`sk_live_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |

### Production Gotchas

- **All six env vars must be set in Vercel.** If any are missing, the app silently degrades (auth fails, database errors get swallowed, users see demo data). There is no `.env.example` file.
- `DATABASE_URL` uses the `prisma+postgres://` accelerate format for migrations/config. `DIRECT_DATABASE_URL` uses standard `postgres://` for runtime queries. Both are needed.
- The Clerk publishable key has a hardcoded fallback in `src/app/layout.tsx` but the secret key does not -- if `CLERK_SECRET_KEY` is missing, all server-side auth calls fail silently.
- Local `.env` points to `localhost:51214` (local Prisma Postgres). Production uses Prisma Cloud.

## Database

**Provider:** Prisma Postgres (cloud) -- managed at https://console.prisma.io

### Models

- **Transaction** -- recurring or one-time income/expense with tags, highlights, notes
- **Override** -- per-occurrence modifications (reschedule, delete, change amount)
- **BalanceReset** -- anchor actual balance on a specific date
- **Settings** -- starting balance per user
- **SharedAccess** -- email-based data sharing between users
- **MonthNote** -- text annotations per month

### Migrations

```bash
npx prisma migrate dev     # create/apply migrations locally
npx prisma db push         # push schema to production (no migration files)
npx prisma studio          # visual database browser
```

Schema source of truth: `prisma/schema.prisma`

### Seed Data

`prisma/seed.ts` contains sample transactions. Only runs on local DB via `start.sh` when the database is empty. Targets `localhost:51214` directly -- never runs against production.

### Backups

- **Local auto-backups:** `start.sh` creates `backups/auto-*.json` on every startup
- **In-app export:** `GET /api/export` returns full JSON backup
- **In-app import:** `POST /api/import` restores from backup JSON
- **Prisma Cloud:** Check https://console.prisma.io for database-level backups (availability varies by plan)

## Deployment

- **Branch:** `main` auto-deploys to production via Vercel
- **Previews:** Vercel creates preview deployments for other branches/PRs
- **Build command:** `next build` (with `prisma generate` in postinstall)
- **Rollback:** Vercel dashboard > Deployments > select previous > Redeploy
- **No `vercel.json`** -- uses default Vercel configuration

### Post-Deploy Checklist

After any deploy that changes env vars or database schema:
1. Verify env vars are set in Vercel (Settings > Environment Variables)
2. Run `npx prisma db push` against production if schema changed
3. Test sign-in flow -- Clerk auth is the most fragile integration

## Page Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page -- feature showcase, pricing, signup CTA |
| `/app` | Main dashboard -- calendar view, transaction management, balance tracking (requires auth) |
| `/sign-in` | Clerk sign-in (redirects to `/app`) |
| `/sign-up` | Clerk sign-up (redirects to `/app`) |

## API Routes

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/state` | GET | Full app state (transactions, overrides, resets, settings, notes). Includes user migration logic |
| `/api/transactions` | POST | Create a transaction |
| `/api/transactions/[id]` | PUT, DELETE | Update or delete a transaction |
| `/api/overrides` | POST | Upsert per-occurrence override (reschedule, delete, modify) |
| `/api/settings` | PUT | Update starting balance |
| `/api/balance-resets` | POST | Set balance reset on a date |
| `/api/balance-resets/[date]` | DELETE | Remove balance reset |
| `/api/month-notes` | GET, POST | Read/write month annotations |
| `/api/share` | GET, POST, DELETE | Manage shared access by email |
| `/api/export` | GET | Export all data as JSON backup |
| `/api/import` | POST | Restore from JSON backup |
| `/api/stripe/checkout` | POST | Create Stripe checkout session |
| `/api/stripe/status` | GET | Check subscription status (includes admin bypass) |
| `/api/stripe/portal` | POST | Create Stripe billing portal session |
| `/api/stripe/webhook` | POST | Stripe webhook handler |

## Auth & Admin

- **Auth provider:** Clerk v7 with `@clerk/nextjs`
- **Middleware:** `src/proxy.ts` -- wraps `clerkMiddleware()` with graceful fallback on failure
- **API auth pattern:** `const { userId } = await auth()` in every route handler, falls back to `"default"` if unauthenticated
- **Admin bypass:** `src/app/api/stripe/status/route.ts` grants Pro status to hardcoded admin emails
- **User data migration:** `src/app/api/state/route.ts` auto-migrates data from old Clerk user IDs to current user on first sign-in
- **Paywall:** Currently disabled in `src/app/app/page.tsx` -- all signed-in users get full access

## Project Structure

```
.
├── prisma/
│   ├── schema.prisma          # Database schema (source of truth)
│   ├── seed.ts                # Local dev seed data
│   └── migrations/            # Prisma migration files
├── public/                    # Static assets (logo.png, logo-white.png)
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout (ClerkProvider, fonts)
│   │   ├── page.tsx           # Landing page (~2,900 lines)
│   │   ├── globals.css        # Tailwind imports, CSS variables
│   │   ├── app/page.tsx       # Main dashboard (~2,900 lines)
│   │   ├── sign-in/           # Clerk sign-in page
│   │   ├── sign-up/           # Clerk sign-up page
│   │   └── api/               # All API route handlers
│   ├── lib/
│   │   ├── prisma.ts          # PrismaClient singleton (uses DIRECT_DATABASE_URL)
│   │   ├── stripe.ts          # Stripe client with lazy init
│   │   └── types.ts           # TypeScript interfaces (Transaction, AppState, etc.)
│   ├── generated/prisma/      # Prisma generated client (do not edit)
│   └── proxy.ts               # Clerk middleware with error fallback
├── backups/                   # Auto-generated JSON backups (local dev only)
├── start.sh                   # Full local dev startup script
├── prisma.config.ts           # Prisma config (uses DATABASE_URL)
├── CLAUDE.md                  # AI assistant instructions
└── AGENTS.md                  # Next.js version warning for AI tools
```

## Themes & Brand

The app has 5 built-in themes selectable by the user:

| Theme | Header Color | Accent |
|-------|-------------|--------|
| Forest (default) | `#065f46` | `#047857` |
| Ocean | `#1e3a5f` | `#2563eb` |
| Slate | `#1e293b` | `#64748b` |
| Plum | `#581c87` | `#7c3aed` |
| Ember | `#7c2d12` | `#c2410c` |

**Landing page brand colors:**
- Primary green: `#068B40`
- Light green backgrounds: `#d4f5e0`, `#e8f8ef`
- Text: `#1e293b` (primary), `#64748b` (secondary)

**Fonts:** Inter (body), Geist Mono (monospace)

## Common Gotchas

1. **Vercel env vars can disappear.** They have been wiped with no explanation before. Always verify they exist after any Vercel project changes. There are six required env vars -- if any is missing, behavior degrades silently.

2. **Clerk user IDs change when users are recreated.** If Clerk users are deleted and recreated, all database records are orphaned under the old user ID. The migration logic in `/api/state` handles known old IDs, but new orphans require manual database updates.

3. **Demo mode is sticky.** `localStorage.getItem("flowycash-demo")` can get stuck on `"true"`. If a user sees demo data unexpectedly, clear it with `localStorage.removeItem("flowycash-demo")` and refresh.

4. **`src/proxy.ts` is the middleware file** -- not `middleware.ts`. This is a non-standard location.

5. **Two database URLs are required.** `DATABASE_URL` (prisma+postgres:// format) is for Prisma CLI/migrations. `DIRECT_DATABASE_URL` (postgres:// format) is for runtime queries via `@prisma/adapter-pg`. Missing either causes different failures.

6. **The main dashboard is ~2,900 lines in a single file** (`src/app/app/page.tsx`). All UI state, API calls, theme logic, and calendar rendering live here.

7. **Stripe is in test mode.** Keys are `pk_test_*` / `sk_test_*`. The paywall is currently disabled in the frontend -- all signed-in users get Pro access regardless of Stripe status.

8. **Admin emails are hardcoded** in `src/app/api/stripe/status/route.ts`. To add a new admin, edit the `ADMIN_EMAILS` array.

9. **Old Clerk user IDs are hardcoded** in `src/app/api/state/route.ts` (`OLD_USER_IDS` array) for data migration. These are one-time migration entries; once a user's data is claimed, the old ID is no longer relevant.

## Incident Log

### 2026-05-13: Production outage -- all env vars missing from Vercel

**Symptoms:** Sign-in broken (Clerk 404s), "demo data" shown instead of real data, 500 errors on API routes.

**Root cause:** All six Vercel environment variables were missing. Cause of deletion unknown.

**Compounding factors:**
- Clerk users had been recreated, generating new user IDs. Old data was orphaned under previous Clerk user IDs.
- The Stripe paywall check (`/api/stripe/status`) was failing, which forced the frontend into demo mode for all signed-in users.
- The data migration logic in `/api/state` only checked for `"default"` user data, not old Clerk user IDs.

**Resolution:**
1. Restored all env vars in Vercel (DATABASE_URL, DIRECT_DATABASE_URL, Clerk keys, Stripe keys) by retrieving them from Prisma Cloud console and Clerk dashboard.
2. Disabled Stripe paywall gating -- all signed-in users now get Pro access without a Stripe check.
3. Added admin email bypass in `/api/stripe/status` (matches by email instead of Clerk user ID).
4. Extended data migration in `/api/state` to check multiple old Clerk user IDs.
5. Manually merged orphaned transaction records in the production database via direct SQL.

**Data impact:** 103 original transactions preserved. 6 transactions created during debugging were merged. All data confirmed intact in production database.

**Lessons:**
- Always verify Vercel env vars exist after any project or team changes.
- Never rely solely on Clerk user IDs for admin bypass -- use email addresses.
- The app should fail loudly (not silently degrade to demo mode) when critical env vars are missing.
