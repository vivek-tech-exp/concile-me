# Revenue Reconciliation

Local development for the revenue reconciliation dashboard.

## Prerequisites

- Node.js 24
- npm
- A Supabase project with Email auth enabled

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

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run typecheck` | Generate route types and run TypeScript |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests |
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
