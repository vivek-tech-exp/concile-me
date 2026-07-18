# High-Level Design

## 1. Purpose

This document defines the stable architecture for the Revenue Reconciliation Dashboard described in `PRODUCT.md`.

It explains system boundaries, responsibilities, data flow, persistence, security, and deployment. It does not define database columns, API payloads, reconciliation formulas, UI component details, or implementation tasks. Those decisions belong in the relevant stage-specific low-level design.

`PRODUCT.md` defines what the product must do. `AGENTS.md` defines permanent engineering constraints. This document defines how the major parts fit together.

## 2. Design goals

The architecture prioritizes:

1. Deterministic and defensible reconciliation.
2. Strict isolation between users and import batches.
3. Traceability from every finding to its source rows.
4. A complete, understandable end-to-end workflow.
5. Graceful handling of invalid data and unavailable LLM service.
6. Minimal operational and architectural complexity.

The product is optimized for correctness and clarity rather than large-scale ingestion.

## 3. System scope

The system supports:

- Email-and-password authentication through Supabase Auth.
- Paired upload of order and payment CSV files.
- Server-side parsing, validation, and normalization.
- Persistent, user-owned import batches and source records.
- Deterministic reconciliation of one import batch at a time.
- Persisted findings and dashboard metrics.
- Dashboard summary, discrepancy chart, search, filtering, and drill-down.
- On-demand server-side LLM explanations of deterministic findings.
- Deployment through Vercel and Supabase.

## 4. Non-goals

The initial system does not include:

- Fuzzy or probabilistic record matching.
- LLM-based reconciliation decisions.
- Exchange-rate conversion or cross-currency aggregation.
- Configurable reconciliation rules in the UI.
- Background jobs, queues, workers, or streaming ingestion.
- Automatic column mapping for arbitrary CSV formats.
- Team accounts, roles, or administrator workflows.
- Realtime updates, offline support, or a PWA.
- A separate backend service or ORM.
- Long-term reconciliation history beyond the current result for an import.
- Persisted LLM conversations or explanations.

These are deferred unless the product requirements change.

## 5. System architecture

The application is one Next.js deployment backed by Supabase and OpenAI.

| Component | Responsibility |
| --- | --- |
| Next.js App Router | Pages, layouts, Server Components, Client Components, and server route handlers |
| Supabase Auth | User identity and session management |
| Supabase Postgres | Import batches, source rows, reconciliation results, metrics, and findings |
| Supabase RLS | Database-level ownership enforcement |
| Pure reconciliation domain | Normalization, payment aggregation, matching, classification, and financial calculations |
| OpenAI API | Plain-language explanation of already-determined findings |
| Vercel | Hosting and server-side execution for the Next.js application |

There is no separate application server. Next.js route handlers provide mutation and external-service boundaries. Server Components perform initial protected reads. The browser client is used only where authentication or interactivity requires it.

## 6. Application boundaries

The codebase uses a feature-oriented structure:

```text
app/                  Routes, layouts, pages, and route handlers
components/           Shared UI primitives
features/             Import, reconciliation, dashboard, and explanation features
lib/domain/            Pure domain contracts and reconciliation logic
lib/supabase/          Browser and server Supabase clients
lib/validation/        Shared external-boundary validation where justified
supabase/schema.sql    Complete database schema, constraints, functions, indexes, and RLS
tests/                 Cross-feature fixtures and integration tests
proxy.ts               Supabase session refresh and protected-route interception
```

Feature-specific contracts and utilities remain inside their feature unless genuinely shared. UI components do not contain authorization, reconciliation rules, or financial calculations.

## 7. Core user flow

### 7.1 Authentication

1. A user signs up or logs in through Supabase Auth.
2. Supabase manages the session through secure cookies.
3. `proxy.ts` refreshes the auth session and redirects obvious unauthenticated navigation.
4. Every protected server operation independently verifies the user with `getUser()`.

### 7.2 Import

1. The authenticated user selects one orders CSV and one payments CSV.
2. A Next.js server route validates authentication, request shape, file type, and file size.
3. Both files are parsed and validated in memory before completion is persisted.
4. Source identifiers and supported values are normalized according to documented rules; original values and row numbers are retained.
5. Reconciliation-blocking errors reject the import with row-level feedback.
6. Non-blocking data-quality issues are retained as warnings.
7. The batch and all accepted source rows are written within a database transaction boundary.
8. Only a fully persisted batch becomes available for reconciliation.

The two files always belong to one user-owned import batch. Rows from different batches are never matched.

### 7.3 Reconciliation

1. The authenticated user starts reconciliation for one completed import batch.
2. The server confirms ownership and loads only that batch's normalized source rows.
3. The pure domain engine aggregates payment events, matches normalized references, classifies findings, and calculates metrics.
4. Monetary results remain partitioned by currency. Amounts in different currencies are never compared or added together.
5. Findings retain references to the supporting order and payment rows.
6. The current reconciliation result, metrics, and findings are persisted atomically.
7. Re-running the same input safely replaces the current result and produces equivalent output without duplication.

### 7.4 Dashboard and drill-down

1. A Server Component loads the selected owned import and its current reconciliation result.
2. The dashboard displays required count metrics and currency-specific financial metrics.
3. A chart summarizes discrepancy count or financial impact by category.
4. The discrepancy table supports search, filters, and deterministic ordering.
5. A detail view shows the finding, financial impact, and supporting source rows.

The dashboard reads persisted engine output. It does not recalculate reconciliation results in the browser.

### 7.5 LLM explanation

1. The user requests an explanation from a finding detail view.
2. A protected server route verifies ownership of the finding and its import.
3. The server builds minimal structured context from the deterministic finding and supporting records.
4. OpenAI returns structured explanatory output describing observed facts, possible causes, and suggested next actions.
5. The response is validated before it reaches the UI.
6. Provider or validation failure returns a safe retryable error without affecting persisted reconciliation results.

Explanations are generated on demand and are not authoritative or persisted initially.

## 8. Data architecture

The high-level data model contains:

| Entity | Purpose |
| --- | --- |
| Import batch | Owns one paired orders/payments import and its processing state |
| Order record | Preserves one parsed order source row and normalized reconciliation fields |
| Payment record | Preserves one parsed payment event and normalized reconciliation fields |
| Reconciliation | Stores the current completed result and dashboard metrics for one import |
| Finding | Stores one business discrepancy or data-quality warning with source lineage |

Supabase Auth owns user identities; the application does not duplicate password or session data.

Every application entity is scoped to a user. Source rows and findings are additionally scoped through their import. Foreign keys, ownership checks, uniqueness constraints, and transactional writes prevent cross-import mixing, orphaned results, and partial current state.

Money is represented as integer minor units with an explicit currency. Counts may span an import; monetary summaries must be grouped or selected by currency.

Exact columns, constraints, status values, and transaction functions are defined in the database LLD before `supabase/schema.sql` is implemented.

## 9. Reconciliation architecture

The reconciliation pipeline is infrastructure-independent:

```text
validated source rows
-> normalized domain records
-> payment events grouped by normalized order reference
-> payment aggregates
-> deterministic matches
-> business discrepancies and data-quality warnings
-> financial impact and dashboard metrics
-> explicitly ordered result
```

The engine accepts explicit input and returns explicit output. It does not read files, query Supabase, call OpenAI, inspect UI state, use the current time, or mutate input.

Matching, tolerance, refund semantics, discrepancy types, severities, and financial formulas are domain decisions. They must be defined from the reference data and product requirements in the reconciliation LLD before engine implementation.

## 10. Security model

Security is enforced at two layers:

- Next.js server boundaries authenticate the user, validate identifiers, and scope every operation.
- Supabase RLS independently restricts every user-owned table using the authenticated user identity.

The browser never supplies authoritative ownership. Public Supabase configuration may be exposed where required, but server secrets and the OpenAI API key remain server-only. A service-role key is not part of the default architecture.

Protected reads and mutations use the authenticated user's Supabase session so RLS remains active. Multi-table database functions must preserve ownership enforcement and must not create a security-definer bypass without an explicit reviewed need.

## 11. Failure and consistency model

- Validation failures return field- or row-level errors and do not create a completed import.
- Multi-table import writes are transactional; partially persisted source data never becomes usable.
- A reconciliation persistence failure does not replace the last completed result with partial data.
- Repeated reconciliation is idempotent from the user's perspective.
- Unauthorized and missing resources are handled without leaking another user's resource existence or data.
- LLM failure affects only the explanation request.
- Server errors expose safe messages while retaining diagnostic detail only in server logs.

## 12. Performance model

Reference-scale CSV files are processed synchronously within a Next.js server request. Parsing and reconciliation operate in memory, while persistence uses bounded batch writes or a database function.

File-size and row-count limits are defined in the ingestion LLD to keep execution within Vercel and database limits. If later requirements exceed synchronous processing limits, background processing can be designed separately rather than anticipated now.

## 13. Testing strategy

- Pure unit tests cover normalization, money parsing, aggregation, matching, every reconciliation rule, metric calculations, and deterministic ordering.
- Fixture tests cover multiple events per order, refunds, status differences, currency differences, duplicate data, missing data, and invalid source values.
- Integration tests cover import transaction behavior, authenticated server routes, current-result replacement, and ownership boundaries.
- RLS verification uses two users and attempts cross-user reads and writes.
- LLM tests mock the provider and cover valid, malformed, empty, and failed responses.
- A production smoke test covers sign-up, import, reconciliation, dashboard, drill-down, explanation, logout, and second-user isolation.

## 14. Deployment architecture

- The Next.js application is deployed to Vercel.
- Supabase hosts Postgres and Auth.
- OpenAI is called only from Vercel server execution.
- Public Supabase values are available to the browser as required.
- Database credentials, server configuration, and the OpenAI API key are configured as deployment secrets.
- `.env.example` documents every required variable without real values.

The deployed application, database, authentication callbacks, and allowed application URLs must be configured and verified together from a fresh browser.

## 15. Decision boundary for LLDs

Each stage-specific LLD must define only the details needed for that stage, based on the repository's actual state. At minimum, an LLD specifies affected files, contracts, behavior, errors, tests, acceptance criteria, and exclusions.

The LLD must not silently change this architecture. If implementation evidence requires an architectural change, update this document deliberately before implementing the divergence.
