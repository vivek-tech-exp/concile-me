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

### Database schema (Stages 3–4)

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

Hosted databases should match `supabase/schema.sql`. Never reset or drop the linked hosted database. Apply schema changes only after explicit approval, using the current `schema.sql` as the source of truth (no migration files in the repository).

### CSV import (Stage 4)

Authenticated users upload exactly one orders CSV and one payments CSV on `/app`.

| Rule | Value |
| --- | --- |
| Max size | 1 MiB per file |
| Max rows | 5,000 data rows per file |
| Encoding | UTF-8 (optional BOM) |
| Delimiter | Comma |
| Orders headers | `order_id,order_date,customer_email,currency,gross_amount,discount,net_amount,status` |
| Payments headers | `transaction_ref,processed_at,order_reference,currency,amount,fee,net_settled,type,status` |

**Blocking errors** reject the import (no database write): wrong/missing/duplicate/unexpected headers, swapped files, invalid UTF-8, oversized files, unsupported statuses/types, malformed money or required timestamps, and other row validation failures.

**Non-blocking warnings** still allow import: missing/invalid customer email, missing order discount, missing payment `processed_at`, and identifiers changed by trim/case normalization.

Reference sample pair (`sample/orders.csv`, `sample/payments.csv`): 185 orders, 187 payments, 5 warnings, 0 blocking errors.

API: `POST /api/imports` (`multipart/form-data` with `orders`, `payments`, and UUID `idempotencyKey`).

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
