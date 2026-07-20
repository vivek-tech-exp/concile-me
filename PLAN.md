# Project Execution Plan

## Purpose

This document is the high-level delivery roadmap for the Revenue Reconciliation Dashboard.

It defines stage order, outcomes, dependencies, and release gates. It is not an implementation specification. Before each stage begins, create a focused low-level design from the repository's actual state. Do not expand future stages in advance.

Project guidance is split deliberately:

* `PRODUCT.md` defines product requirements.
* `AGENTS.md` defines permanent engineering constraints.
* `HLD.md` defines the stable architecture.
* `DESIGN.md` defines the UI clarity baseline.
* `PLAN.md` defines delivery order and stage outcomes.
* The current stage LLD defines exact implementation details.

## Working method

For each stage:

1. Inspect the current repository and completed stages.
2. Create one stage-specific LLD.
3. Resolve material product, security, data, or financial decisions before coding.
4. Implement only the approved LLD.
5. Run the stage's automated and manual checks.
6. Review the diff and update this file's status.
7. Create a meaningful commit only when the current task explicitly requests it.

An LLD must state:

* Scope and exclusions.
* Files to create or modify.
* Contracts, data shapes, and boundaries.
* Expected behavior and failure behavior.
* Tests and verification commands.
* Acceptance criteria.

## Status

Use only:

* `NOT STARTED`
* `IN PROGRESS`
* `BLOCKED`
* `COMPLETE`

| Stage | Outcome                                 | Status      |
| ----- | --------------------------------------- | ----------- |
| 1     | Application foundation                  | COMPLETE    |
| 2     | Supabase and authentication             | COMPLETE    |
| 3     | Database model and user isolation       | COMPLETE    |
| 4     | CSV ingestion                           | COMPLETE    |
| 5     | Reconciliation specification            | NOT STARTED |
| 6     | Reconciliation engine and persistence   | NOT STARTED |
| 7     | Dashboard and discrepancy investigation | NOT STARTED |
| 8     | LLM explanation                         | NOT STARTED |
| 9     | Hardening and documentation             | NOT STARTED |
| 10    | Deployment and production acceptance    | NOT STARTED |

**Current stage:** Stage 5 — Reconciliation specification.

---

## Stage 1 — Application foundation

**Goal:** Establish a minimal, reproducible Next.js application with stable verification commands.

**Includes:**

* Initialize Next.js 16, React 19, strict TypeScript, Tailwind CSS 4, and the App Router.
* Lock exact dependency versions using the chosen package manager.
* Add only the dependencies required by `AGENTS.md` and the current foundation.
* Establish the root project structure described in `HLD.md`.
* Configure shadcn/ui with only the initial primitives required for the application shell.
* Create the public authentication shell and protected application shell as labelled scaffolding.
* Provide `dev`, `typecheck`, `lint`, `test`, and `build` scripts.
* Create a secret-free `.env.example` baseline.

**Exit criteria:**

* The application starts and all initial routes render.
* Strict typecheck, lint, tests, and production build pass.
* No Pages Router, `middleware.ts`, speculative feature code, or unnecessary dependency exists.
* The repository contains no secret or generated output.

---

## Stage 2 — Supabase and authentication

**Depends on:** Stage 1.

**Goal:** Provide secure authentication and server-verified protected navigation.

**Includes:**

* Validate required Supabase environment variables.
* Add centralized browser and server Supabase clients.
* Add root `proxy.ts` for session refresh and route interception.
* Implement signup, login, logout, and authentication error states.
* Protect application routes and redirect authenticated users away from auth pages where appropriate.
* Use server-side `getUser()` verification for protected operations.

**Exit criteria:**

* Signup, login, refresh persistence, logout, and protected-route redirects work.
* Missing configuration fails clearly and safely.
* No custom session handling, service-role key, or browser-exposed server secret exists.
* Relevant tests, typecheck, lint, and build pass.

---

## Stage 3 — Database model and user isolation

**Depends on:** Stage 2.

**Goal:** Create the minimal persistent model and enforce ownership at the database layer.

**Includes:**

* Define import batches, order records, payment records, current reconciliations, and findings.
* Store money as integer minor units with explicit currency.
* Preserve source lineage and original versus normalized identifiers.
* Add foreign keys, checks, uniqueness rules, indexes, and deliberate deletion behavior.
* Add transactional database boundaries for paired imports and current-result replacement.
* Enable RLS and ownership policies on every user-owned table.
* Add database types used by the application.
* Keep the complete setup in `supabase/schema.sql`; do not add migrations.

**Exit criteria:**

* The schema applies successfully to a fresh Supabase project.
* Two-user tests prove cross-user reads, writes, updates, and deletes fail.
* Child ownership cannot be forged through another user's parent ID.
* Partial import or reconciliation writes cannot become current usable state.

---

## Stage 4 — CSV ingestion

**Depends on:** Stage 3.

**Goal:** Import one paired orders/payments batch safely with actionable feedback.

**Includes:**

* Define raw and normalized order/payment contracts.
* Parse money exactly into minor units without floating-point arithmetic.
* Parse CSV files server-side with source row numbers.
* Validate file limits, required headers, identifiers, dates, statuses, types, currencies, and amounts.
* Normalize only documented fields while preserving originals.
* Separate reconciliation-blocking errors from non-blocking data-quality warnings.
* Persist the batch and all accepted rows transactionally.
* Provide upload, progress, success, error, retry, and owned-import-list states.

**Exit criteria:**

* The reference CSV pair imports with expected row counts and visible warnings.
* Invalid or swapped files return useful file- and row-level errors.
* Failed persistence never exposes a completed partial batch.
* Imports remain isolated by user and batch.

---

## Stage 5 — Reconciliation specification

**Depends on:** Stage 4.

**Goal:** Define the complete deterministic business behavior before implementing the engine.

**Includes:**

* Profile the reference datasets programmatically and record independently verified observations.
* Define identifier normalization and the exact matching key.
* Define aggregation for settled charges, failed attempts, pending attempts, and refunds.
* Define business discrepancies separately from data-quality warnings.
* Cover missing and orphan records, duplicate source data, duplicate successful charges, amount differences, status conflicts, refund states, currency conflicts, and order arithmetic.
* Define tolerance, severity, financial impact, and false-positive exclusions for every finding type.
* Define total orders, total payments, reconciled value, disputed value, money at risk, and reconciliation rate.
* Keep monetary metrics separated by currency and prevent double counting.
* Record the final rules and reference-data findings in `docs/reconciliation.md`.

**Exit criteria:**

* Every rule has explicit inputs, detection logic, output, impact formula, and non-triggering cases.
* Refund, status, tolerance, currency, duplicate, and count semantics are unambiguous.
* Expected reference-dataset findings and metrics are independently reproducible.
* No rule depends on a hardcoded source identifier, row position, or LLM decision.

No reconciliation engine code begins until this stage is complete.

---

## Stage 6 — Reconciliation engine and persistence

**Depends on:** Stage 5.

**Goal:** Implement and persist the documented reconciliation behavior as a pure deterministic pipeline.

**Includes:**

* Implement normalization inputs, payment grouping, aggregation, matching, classification, impact calculation, metrics, and explicit output ordering.
* Keep the engine independent of React, Supabase, HTTP, OpenAI, current time, and database ordering.
* Support multiple findings per order and trace each finding to supporting source rows.
* Add an authenticated reconciliation boundary for one owned completed import.
* Persist the current reconciliation, metrics, and findings atomically.
* Make repeated execution safe, equivalent, and non-duplicating.

**Exit criteria:**

* Unit tests cover every documented rule, boundary, event sequence, and financial formula.
* Reference-data fixture tests match the independently calculated expectations.
* Repeated and shuffled input produces equivalent explicitly ordered output.
* Persistence failure cannot replace a valid current result with partial data.

---

## Stage 7 — Dashboard and discrepancy investigation

**Depends on:** Stage 6.

**Goal:** Turn persisted reconciliation output into an actionable revenue workflow.

**Includes:**

* Load the selected owned import and current reconciliation in Server Components.
* Display total orders, total payment records, reconciled value, disputed value, and money at risk.
* Present monetary cards per currency or for an explicitly selected currency.
* Show reconciliation health and a meaningful discrepancy chart.
* Provide an owned-import selector where needed.
* Provide a searchable, filterable, deterministically ordered discrepancy table.
* Provide a detail view with finding facts, impact, original values, normalized values, and supporting rows.
* Handle no-import, unreconciled, empty, loading, error, and retry states.

**Exit criteria:**

* Dashboard values exactly match persisted engine expectations.
* A user can move from every headline or category to the supporting records.
* Search and filters cover order, payment, transaction, type, severity, and currency where applicable.
* Desktop and mobile layouts are accessible and keyboard usable.

---

## Stage 8 — LLM explanation

**Depends on:** Stage 7.

**Goal:** Explain deterministic findings without allowing the model to influence reconciliation.

**Includes:**

* Define the structured explanation input and output contracts.
* Build a minimal prompt from an owned persisted finding and its supporting facts.
* Call OpenAI only from a protected server boundary.
* Choose and document the model, temperature, and structured-output approach.
* Validate every response and distinguish facts, possible causes, and suggested actions.
* Add loading, success, malformed-response, provider-error, and retry UI states.
* Keep explanations on demand and unpersisted initially.

**Exit criteria:**

* Valid structured output renders correctly.
* Malformed, empty, timed-out, rate-limited, and failed responses are safe and retryable.
* Ownership is revalidated before every model call.
* The application remains fully usable without OpenAI.

---

## Stage 9 — Hardening and documentation

**Depends on:** Stages 1–8.

**Goal:** Verify security, resilience, usability, and repository completeness before release.

**Includes:**

* Run two-user isolation checks through database and server boundaries.
* Audit secrets, client bundles, logging, route errors, and authorization paths.
* Verify file-size and request-abuse limits.
* Exercise malformed CSV, database failure, duplicate action, and LLM failure states.
* Complete responsive, accessibility, empty-state, and retry-state review.
* Complete README setup, architecture, reconciliation rules, reference-data findings, LLM approach, testing, limitations, deployment, and AI-tool usage.
* Reconcile `.env.example` with every environment access.

**Exit criteria:**

* Tests, typecheck, lint, and production build pass.
* No secret, private identity, placeholder business logic, or unsupported claim remains.
* A clean-clone setup follows the README successfully.
* Known limitations are documented honestly.

---

## Stage 10 — Deployment and production acceptance

**Depends on:** Stage 9.

**Goal:** Deploy and verify the complete product from a fresh browser.

**Includes:**

* Apply `supabase/schema.sql` to the production Supabase project.
* Configure production Auth URLs, environment variables, and RLS.
* Deploy the Next.js application to Vercel.
* Verify signup or documented test access.
* Run the complete production workflow: import, reconcile, inspect dashboard, search/filter, open detail, request explanation, rerun, and log out.
* Verify second-user isolation in production.
* Verify public repository, application, documentation, and access links.

**Exit criteria:**

* The full workflow succeeds from a fresh private browser.
* Results match tested expectations and repeated reconciliation does not duplicate them.
* LLM explanation works or fails gracefully.
* Public links work and the repository is release-ready.

---

## Release gates

### Gate A — Foundation ready

Stages 1–3 complete: the application builds, authentication works, schema is reproducible, and two-user isolation passes.

### Gate B — Reconciliation core ready

Stages 4–6 complete: imports are transactional, rules are documented, the pure engine is fully tested, and current results persist safely.

### Gate C — Product flow ready

Stages 7–8 complete: dashboard, drill-down, and optional LLM explanation work end to end.

### Gate D — Release ready

Stages 9–10 complete: hardening passes, documentation is accurate, and the production workflow succeeds.

## Deferred scope

The non-goals in `HLD.md` remain deferred. Do not implement them unless the product and architecture are deliberately updated.
