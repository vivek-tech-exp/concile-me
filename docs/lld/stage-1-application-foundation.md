# Stage 1 LLD — Application Foundation

## Scope

Establish a minimal, reproducible Next.js application with stable verification commands, labelled route shells, and the root structure required by `HLD.md`.

## Exclusions

- Supabase clients, `proxy.ts` session refresh, and real authentication (Stage 2).
- Database schema or RLS (Stage 3).
- CSV ingestion, reconciliation, dashboard features, LLM, or feature modules beyond shell labels.
- Pages Router, `middleware.ts`, ORM, global state, or unused stack packages (Zod, PapaParse, Recharts, OpenAI, `@supabase/*`).
- Placeholder domain modules, empty feature packages, or speculative abstractions.

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Package manager | npm | Matches Node 24 toolchain already present; lockfile is `package-lock.json`. |
| App directory | `app/` at repo root (no `src/`) | Matches `HLD.md` layout. |
| Lint | ESLint via `create-next-app` | Standard Next.js path; script name `lint`. |
| Test runner | Vitest | Fast, TypeScript-native, no React Testing Library required for Stage 1 smoke tests. |
| UI primitives | shadcn/ui (Radix) with `button`, `card`, `input`, `label` | Enough for auth and app shell scaffolding without speculative components. |
| Public auth routes | `/login`, `/signup` | Labelled forms only; no auth calls. |
| Protected shell | `/app` layout + index | Labelled scaffolding only; no session checks yet. |
| Home route | `/` redirects to `/login` | Gives a single entry until Stage 2 auth redirects exist. |
| Env baseline | Secret-free `.env.example` with placeholder names only | Documents future vars without implementing consumers. |

## Files to create or modify

### Create

- Next.js / TypeScript / Tailwind / ESLint config produced by `create-next-app` (root).
- `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (redirect).
- `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`.
- `app/(app)/layout.tsx`, `app/(app)/app/page.tsx`.
- `components/ui/*` via shadcn for button, card, input, label.
- `lib/utils.ts` (shadcn `cn` helper).
- `tests/smoke.test.ts` — asserts project identity constant.
- `vitest.config.ts`.
- `.env.example`.
- Directory anchors used later (empty `.gitkeep` only where needed for `features/`, `lib/domain/`, `lib/validation/`, `lib/supabase/`, `supabase/`, `tests/` if not otherwise populated). Prefer real files over empty dirs when content exists.

### Modify

- `.gitignore` — keep Next.js ignores; ensure `.env` ignored and `.env.example` tracked.
- `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`.
- `PLAN.md` Stage 1 status → `COMPLETE` when exit criteria pass.
- `README.md` — minimal local run note only if required for reproducibility; avoid claiming unfinished product features.

### Do not create

- `middleware.ts`
- `proxy.ts` (Stage 2)
- `pages/`
- Real Supabase or OpenAI integration code

## Contracts and boundaries

- Route groups `(auth)` and `(app)` are UI organization only; they do not enforce auth.
- Shell pages may render disabled or non-submitting labelled controls; they must not call auth APIs.
- Shared UI lives in `components/`; no domain or authorization logic in UI components.
- Import alias `@/*` maps to the repository root.

## Expected behavior

1. `npm run dev` serves the App Router application.
2. `/` redirects to `/login`.
3. `/login` and `/signup` render the public authentication shell.
4. `/app` renders the protected application shell with an explicit scaffolding label.
5. `npm run typecheck`, `lint`, `test`, and `build` succeed with zero secrets in the tree.

## Failure behavior

- Type, lint, or test failures block Stage 1 completion.
- Missing env vars must not crash the foundation app (no env consumers yet).

## Tests and verification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Manual: open `/login`, `/signup`, and `/app` and confirm labelled shells render.

## Acceptance criteria

- [x] Next.js 16, React 19, strict TypeScript, Tailwind CSS 4, App Router.
- [x] Exact versions locked in `package-lock.json`.
- [x] Root structure aligned with `HLD.md` without speculative feature code.
- [x] shadcn configured with shell primitives only.
- [x] Public auth shell and protected app shell present as labelled scaffolding.
- [x] Scripts: `dev`, `typecheck`, `lint`, `test`, `build`.
- [x] Secret-free `.env.example`.
- [x] No Pages Router, `middleware.ts`, unnecessary dependencies, or committed secrets/generated output (`.next`, `node_modules` untracked).
