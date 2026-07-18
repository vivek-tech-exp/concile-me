# Stage 2 LLD — Supabase and Authentication

## Scope

Deliver email/password authentication and protected navigation using Supabase Auth and `@supabase/ssr`. Leave database tables, RLS, and user-owned application data for Stage 3.

## Exclusions

- Application tables and `supabase/schema.sql`
- RLS and two-user database isolation tests
- OAuth, password reset, MFA, profiles, roles, service-role access
- CSV ingestion, reconciliation, deployment, production Supabase project setup beyond local env documentation

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Public key env name | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Current Supabase guidance; replaces legacy anon key placeholder |
| Proxy auth check | `auth.getClaims()` | Fast optimistic route interception per Stage 2 plan |
| Authorization boundary | `auth.getUser()` in `/app` layout and protected operations | Proxy is never authoritative |
| Auth mutations | Route handlers under `/auth/*` | Server-only; forms POST to fixed paths |
| Redirect policy | Fixed paths only (`/`, `/login`, `/signup`, `/app`) | No open redirects via `next` |
| Error feedback | Allowlisted query codes → safe copy | Never expose raw Supabase errors or account existence |
| Password rules | Defer to Supabase project policy | Do not invent a second policy in the app |
| Confirmation | `GET /auth/confirm` with `token_hash` + `type` | Supports email-confirm-enabled projects |

## Files

### Create

- `docs/lld/stage-2-supabase-authentication.md` (this file)
- `lib/validation/env.ts` — Supabase env Zod schema and parse helper
- `lib/validation/auth-credentials.ts` — email/password FormData validation
- `lib/auth/messages.ts` — allowlisted error/success message map
- `lib/auth/redirects.ts` — signed-in / signed-out path policy
- `lib/supabase/client.ts` — browser client
- `lib/supabase/server.ts` — cookie server client
- `lib/supabase/proxy.ts` — session refresh + optimistic redirects
- `proxy.ts` — root proxy with matcher
- `app/auth/signup/route.ts`
- `app/auth/login/route.ts`
- `app/auth/logout/route.ts`
- `app/auth/confirm/route.ts`
- Tests under `tests/` for env, credentials, redirects, auth handlers, proxy matcher

### Modify

- `.env.example` — publishable key; Auth setup notes
- `package.json` / lockfile — `@supabase/ssr`, `@supabase/supabase-js`, `zod`
- Auth UI: `app/(auth)/*`, `app/(app)/layout.tsx`, `app/page.tsx` as needed
- `PLAN.md` status (IN PROGRESS now; COMPLETE only after checks + browser acceptance)
- `README.md` — Auth and env docs after verification

### Remove

- `lib/supabase/.gitkeep` once real modules exist
- Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.example`

## Contracts

### Environment

```ts
{
  NEXT_PUBLIC_SUPABASE_URL: string // absolute https URL
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string // non-empty
}
```

Missing or malformed values throw/return a typed configuration error. Messages must not include the raw values.

### Credentials

```ts
{ email: string; password: string }
```

Email must be a valid email format. Password must be a non-empty string. Length/complexity beyond emptiness is enforced by Supabase.

### Safe message codes

`invalid_credentials` | `validation` | `provider` | `confirmation_expired` | `config` | `check_email`

### Redirect policy

| Authenticated | Path | Destination |
| --- | --- | --- |
| false | `/` | `/login` |
| false | `/app` (+ nested) | `/login` |
| false | `/login`, `/signup` | stay |
| true | `/` | `/app` |
| true | `/login`, `/signup` | `/app` |
| true | `/app` | stay |
| either | `/auth/*` | stay (handlers manage outcome) |

## Behavior

### Signup `POST /auth/signup`

1. Validate FormData.
2. Call `signUp({ email, password })`.
3. If session present → redirect `/app`.
4. If user created without session → redirect `/signup?message=check_email`.
5. On provider failure → `/signup?error=provider` (generic; do not reveal existing account).

### Login `POST /auth/login`

1. Validate FormData.
2. Call `signInWithPassword`.
3. Success → `/app`.
4. Failure → `/login?error=invalid_credentials`.

### Logout `POST /auth/logout`

1. `signOut()`.
2. Redirect `/login`.

### Confirm `GET /auth/confirm`

1. Read `token_hash` and `type` query params.
2. `verifyOtp({ type, token_hash })`.
3. Success → `/app`.
4. Failure → `/login?error=confirmation_expired`.

### Proxy

- Refresh session cookies; copy cookies and cache headers onto the response.
- Use `getClaims()` for optimistic redirects per the table above.
- Matcher excludes `_next/static`, `_next/image`, `favicon.ico`, and common static extensions.

### Protected layout

- `createClient()` then `getUser()`.
- No user → `redirect('/login')`.
- Optionally show verified email; logout is a POST form.

## Tests

- Env: valid, missing URL/key, malformed URL.
- Credentials: wrong types, missing, malformed email.
- Redirect policy matrix.
- Login success / safe failure (mocked Supabase).
- Signup immediate session vs confirmation-required.
- Confirm valid / invalid token.
- Logout clears session and redirects.
- Proxy matcher excludes framework assets.
- Assert protected checks call `getUser`, not `getSession`.

## Verification

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

Manual browser acceptance against a real Supabase project (see Stage 2 plan checklist).

## Acceptance criteria

- [x] Dependencies and publishable-key env validation in place
- [x] Browser, server, and proxy clients centralized
- [x] Signup, login, logout, confirm flows work with safe errors
- [x] Navigation table enforced; `/app` uses `getUser()`
- [x] Automated tests and final scripts pass
- [x] Real-browser acceptance completed before PLAN/README completion update
