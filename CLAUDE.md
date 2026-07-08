# AI Assistant Instructions

Read `README.md` first for full project documentation, tech stack, routes, and environment setup.

## Next.js Version Warning

@AGENTS.md

## Coding Preferences

- Match existing patterns. This codebase uses inline styles extensively in the main dashboard -- do not refactor to CSS modules or styled-components unless asked.
- No premature abstractions. The main dashboard (`src/app/app/page.tsx`) is ~2,900 lines in one file. That is intentional. Do not split it into components unless explicitly asked.
- Prefer editing existing files over creating new ones.
- No emojis in code or commit messages unless the user asks.
- No docstrings, comments, or type annotations on code you did not change.
- No speculative error handling or feature flags.

## Deployment Discipline

- **Confirm before pushing** if the change is production-visible. Pushes to `main` auto-deploy to Vercel.
- After pushing, remind the user to wait ~2 minutes for Vercel to build and deploy.
- If env vars are involved, remind the user to check Vercel Settings > Environment Variables. They have been silently wiped before.

## Database Safety

- `DIRECT_DATABASE_URL` is the runtime connection. `DATABASE_URL` is for Prisma CLI. Both are required.
- Never run `prisma migrate reset` or destructive operations against production without explicit confirmation.
- The `prisma/seed.ts` file targets localhost only. Never modify it to point at production.
- Before any schema change, confirm the user understands they need to run `npx prisma db push` against production after deploying.
- Local backups exist in `backups/`. The export API (`GET /api/export`) can create production backups.

## Files to Treat Carefully

- `src/app/app/page.tsx` -- main dashboard, ~2,900 lines. All UI logic lives here. Changes have high blast radius.
- `src/app/page.tsx` -- landing page, ~2,900 lines. Same caution.
- `src/app/api/state/route.ts` -- loads all user data, contains user ID migration logic and shared access. Changes affect every page load.
- `src/app/api/stripe/status/route.ts` -- contains admin email bypass list. If this route errors, all users get forced into demo mode.
- `src/lib/prisma.ts` -- database client singleton. Uses `DIRECT_DATABASE_URL`, not `DATABASE_URL`.
- `src/proxy.ts` -- Clerk middleware (non-standard filename, NOT `middleware.ts`).
- `prisma/schema.prisma` -- database schema source of truth.
- `start.sh` -- local dev startup. Seeds data and creates auto-backups.

## Auth Patterns

- All API routes use `const { userId } = await auth()` from `@clerk/nextjs/server`.
- If `userId` is null, routes fall back to `"default"` user ID (not authenticated).
- Admin bypass is by email, not user ID. Admin list is in `/api/stripe/status`.
- Clerk user IDs change when users are deleted/recreated. Data orphaning is a known risk. Migration logic in `/api/state` handles known old IDs.
- The Stripe paywall is currently disabled. All signed-in users get Pro access via the frontend bypass in `src/app/app/page.tsx`.

## Common User Asks

### "Add a new transaction field"
1. Add column to `prisma/schema.prisma`
2. Update `src/lib/types.ts`
3. Update `POST /api/transactions` and `PUT /api/transactions/[id]`
4. Update the form and display in `src/app/app/page.tsx`
5. Run `npx prisma db push` locally, test, then push and run against production

### "Add a new API route"
1. Create `src/app/api/<name>/route.ts`
2. Use `auth()` for user scoping
3. Follow existing patterns: try/catch, return NextResponse.json()

### "Fix auth / sign-in issues"
1. Check Vercel env vars (CLERK_SECRET_KEY especially)
2. Check Clerk dashboard for user status
3. Check browser console for 404s to Clerk API
4. Clear `localStorage.removeItem("flowycash-demo")` if stuck in demo mode

### "Deploy a change"
1. Make the change
2. `git add <files> && git commit -m "message" && git push`
3. Wait ~2 minutes for Vercel build
4. Test on https://flowycash.com
5. If broken, Vercel dashboard > Deployments > previous deployment > Redeploy

### "Restore data from backup"
1. Local backups in `backups/` directory (JSON format)
2. Use `POST /api/import` with backup JSON body
3. Or connect directly to production DB via `DIRECT_DATABASE_URL` for manual SQL fixes
