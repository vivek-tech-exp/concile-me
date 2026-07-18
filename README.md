# Revenue Reconciliation

Local development for the revenue reconciliation dashboard.

## Prerequisites

- Node.js 24
- npm
- Docker (for local Supabase)
- A Supabase project with Email auth enabled (local via CLI, or remote)

## Setup

```bash
npm install
cp .env.example .env.local
```

Set these values in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (public) key |

Optional later:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-side LLM explanations (Stage 8+) |

### Supabase Auth configuration (demo)

Use one Supabase project for both localhost and production:

1. Enable the Email provider in Authentication → Providers.
2. **Turn off “Confirm email”** (Providers → Email). Signup then returns a session immediately on localhost and production — same behavior.
3. Authentication → URL Configuration:
   - **Site URL:** `https://concile-me.vercel.app`
   - **Redirect URLs** (add both):
     - `http://localhost:3000/**`
     - `https://concile-me.vercel.app/**`
4. Password rules stay on the Supabase project policy; the app does not invent a second policy.

Local and prod share the same Supabase URL and publishable key (already in `.env.local` and Vercel).

### Database schema (Stage 3)

The complete database definition lives in `supabase/schema.sql` (no migration files).

Local apply and tests (requires `supabase start`):

```bash
npm run db:reset          # reset local DB, apply schema.sql + test helpers
npm run test:db           # reset, then run pgTAP tests
supabase db lint --local --schema public
npm run db:types          # regenerate lib/supabase/database.types.ts
npm run db:types:check    # fail if generated types are stale
```

**Cascade deletion:** deleting an Auth user cascades through `import_batches` and all owned children (orders, payments, reconciliations, metrics, findings, and lineage). Import-time data-quality warnings are stored as findings with `reconciliation_id IS NULL` and are removed with the import, not with reconciliation replacement.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run typecheck` | Generate route types and run TypeScript |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests |
| `npm run test:db` | Reset local DB and run pgTAP tests |
| `npm run db:reset` | Reset local DB and apply `supabase/schema.sql` |
| `npm run db:types` | Generate Supabase TypeScript types from local DB |
| `npm run build` | Production build |

## Authentication routes

| Path | Behavior |
| --- | --- |
| `/` | Redirects to `/login` or `/app` based on session |
| `/login` | Email/password login |
| `/signup` | Email/password signup |
| `/auth/confirm` | Email confirmation (`token_hash` + `type`) |
| `/auth/logout` | `POST` only — ends the session |
| `/app` | Protected application shell (`getUser()` verified) |
