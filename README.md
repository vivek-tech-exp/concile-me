# Revenue Reconciliation

Local development for the revenue reconciliation dashboard.

## Prerequisites

- Node.js 24
- npm

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` when later stages require Supabase or OpenAI. Stage 1 runs without them.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run typecheck` | Generate route types and run TypeScript |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests |
| `npm run build` | Production build |

## Routes (Stage 1 scaffolding)

- `/` redirects to `/login`
- `/login`, `/signup` — public authentication shell (not wired)
- `/app` — protected application shell (not protected yet)
