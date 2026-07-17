# [AGENTS.md](http://AGENTS.md)

## Purpose

Build the small, complete revenue-reconciliation application defined in `PRODUCT.md`.

Optimize for:

1. Correct reconciliation.
2. Secure user isolation.
3. Complete deployed workflow.
4. Clear, testable code.
5. Useful error handling and UI.

Do not trade correctness or completion for speculative architecture or visual polish.

## Instructions

- `PRODUCT.md` is the product source of truth.
- Follow the current task's scope and acceptance criteria exactly.
- Inspect existing code, contracts, tests, and configuration before editing.
- Do not invent requirements, domain rules, files, APIs, schemas, or abstractions.
- When a material product, security, or financial decision is unspecified, stop and ask.
- Implement only the current task. Do not anticipate later stages.
- Prefer the smallest complete change that fits the existing design.
- Preserve unrelated code and user changes.



## Stack

Use:

- Next.js 16 App Router.
- React 19.
- TypeScript in strict mode.
- Node.js 24.
- Tailwind CSS 4.
- shadcn/ui where useful.
- Supabase Postgres, Auth, and Row Level Security.
- Zod 4 for external-boundary validation.
- PapaParse for CSV parsing.
- Recharts for the required chart.
- OpenAI SDK for server-side explanations.
- Vercel for deployment.

After initialization, `package.json` and the lockfile define exact dependency versions. Use the repository's existing package manager.

Do not add an ORM, global state library, separate backend, migration framework, queue, worker, microservice, or dependency without a demonstrated need. Database setup belongs in `supabase/schema.sql`; do not create migration files.

## Architecture

- Use the App Router only. Do not add `pages/`, Pages Router data APIs, or `middleware.ts`.
- Use root `proxy.ts` for Supabase session refresh and route interception.
- Default to Server Components. Add `"use client"` only for browser APIs, hooks, event handlers, forms, and interactive charts.
- Keep Client Components small. Prefer server-side initial loading over `useEffect` data fetching.
- Keep UI, application orchestration, domain logic, and infrastructure concerns separate.
- Do not introduce repository, service, factory, or generic utility layers unless current repeated complexity justifies them.
- Do not create placeholder modules or future-facing abstractions.

The reconciliation engine must be pure TypeScript. It must not import React or Supabase, access request or browser state, call an LLM, read the database, use the current time, or depend on input ordering.

## Type safety and validation

- Keep TypeScript strict.
- Do not use explicit `any` in application code. Use `unknown` at untrusted boundaries and narrow it safely.
- Avoid unsafe type assertions, suppression comments, and non-null assertions. Use them only when an invariant is proven and clear.
- Validate CSV rows, request data, URL parameters, environment variables, database JSON, and LLM output before use.
- Define or update contracts before implementing consumers.
- Do not silently coerce malformed external values.
- Return actionable validation errors without exposing internal details.



## Authentication and data isolation

- Use Supabase Auth. Do not implement custom session, password, or token handling.
- Keep Supabase client construction centralized, with separate browser and server clients.
- Verify protected server operations with `supabase.auth.getUser()`.
- Never trust a client-provided `user_id` or authorization decision.
- Scope every user-owned operation to the authenticated user and relevant import.
- Enable RLS on every user-owned table.
- Use appropriate `USING` and `WITH CHECK` policies for supported operations.
- Ensure child-row ownership cannot be forged through a mismatched parent.
- Never expose a service-role key or server secret to browser code.
- Do not use service-role access unless the current task explicitly demonstrates and documents why authenticated RLS access is insufficient.

A user must never access another user's imports, source rows, reconciliation results, metrics, or explanations.

## CSV ingestion and persistence

- Treat uploaded files and every CSV field as untrusted input.
- Validate files on the server; client validation is only a usability aid.
- Enforce documented file limits, required headers, source-specific field rules, supported statuses, dates, identifiers, and monetary formats.
- Preserve source file identity, row number, and original values needed for traceability.
- Keep original and normalized identifiers distinct.
- Apply only explicitly documented normalization.
- Distinguish reconciliation-blocking errors from non-blocking data-quality warnings.
- Keep every record within one authenticated user and one import batch.
- Never mix records or results between imports.
- Do not report a partial import or reconciliation run as completed.
- Make retries and repeated reconciliation safe and non-duplicating.



## Financial correctness

- Never use binary floating-point arithmetic for money.
- Parse source amounts directly into integer minor units and store them as integers.
- Keep currency attached to every monetary value.
- Never compare or aggregate amounts across currencies unless an explicit conversion rule exists.
- Keep order value, successful charges, refunds, net collected, reconciled value, disputed value, and money at risk as separate concepts.
- Do not invent tolerances, financial-impact formulas, or status semantics. Implement the current documented rules and tests.
- Do not count the same financial exposure more than once.



## Reconciliation

- Reconciliation must be deterministic and repeatable.
- Normalize before matching and preserve original values for display and audit.
- Match only using documented deterministic keys. Do not use fuzzy matching or an LLM.
- Treat payment rows as events. Do not assume one payment row per order.
- Aggregate successful charges, failed attempts, pending attempts, and refunds according to documented rules.
- Keep business discrepancies separate from data-quality warnings.
- Support multiple independent findings for one order when the rules require them.
- Produce stable results and explicit ordering independent of source row order or database return order.
- Do not hardcode source IDs, row positions, totals, or expected findings in application logic.



## LLM integration

- The LLM may explain or summarize deterministic findings only.
- It must not match records, classify discrepancies, calculate values, set risk, repair data, or make authorization decisions.
- Call the model only from server-side code and never expose its API key.
- Send the minimum required structured context.
- Request structured output and validate it before use.
- Separate observed facts from suggested causes or actions.
- Handle timeouts, provider errors, rate limits, empty output, and malformed output.
- The core application must remain usable when the LLM is unavailable.



## Errors and UI

- Handle expected authentication, authorization, validation, import, reconciliation, database, and LLM failures explicitly.
- Do not expose stack traces, SQL details, internal paths, environment values, or secrets.
- Do not swallow exceptions or present failed work as successful.
- Provide relevant loading, empty, success, error, and retry states for asynchronous flows.
- Use semantic HTML, accessible labels, keyboard-operable controls, and visible focus states.
- Keep financial calculations and authorization logic out of UI components.



## Testing

- Test behavior, boundaries, and failure modes introduced or changed by the current task.
- Prioritize pure unit tests for normalization, exact money parsing, payment aggregation, reconciliation rules, financial impact, and double-count prevention.
- Add integration coverage for import persistence, authenticated ownership, RLS-sensitive behavior, and route contracts where relevant.
- Test malformed LLM responses without requiring live model calls.
- Keep tests deterministic. Do not weaken, skip, or delete valid tests to make an implementation pass.



## Working discipline

Before editing:

1. Read the current task.
2. Inspect relevant implementation, tests, contracts, and configuration.
3. Identify the smallest complete change.

Before declaring the task complete:

1. Run relevant targeted tests.
2. Run `npm run typecheck`.
3. Run `npm run lint`.
4. Run `npm run build` when integration or deployment behavior is affected.
5. Review the diff for unrelated changes, placeholders, leaked secrets, and unsupported claims.

Never claim a check passed unless it was executed successfully. Report the exact checks run and any remaining limitation.

Do not create commits, push branches, deploy, modify external services, or rewrite Git history unless the current task explicitly requests it.

## Git hygiene

- Do not commit directly to the main or master branch. Use feature branches for all changes.
- Keep commits small, focused, and logically grouped.
- Write clear, descriptive commit messages that explain intent.
- Open small, reviewable pull requests rather than large, sweeping changes.
- Ensure all checks pass before requesting review or merging.
- Do not rewrite shared history or force-push to protected branches.
- Keep branches up to date with the base branch using safe merge or rebase practices as appropriate.

