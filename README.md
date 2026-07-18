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

### Supabase Auth configuration

1. Enable the Email provider in Authentication → Providers.
2. Add `http://localhost:3000/**` under Authentication → URL Configuration → Redirect URLs.
3. Set Site URL to `http://localhost:3000` for local development.
4. If email confirmation is enabled, set the Confirm signup template link to:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

5. Password rules are enforced by the Supabase project policy; the app does not invent a second policy.

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
