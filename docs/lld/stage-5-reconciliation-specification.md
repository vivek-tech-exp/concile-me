# Stage 5 LLD — Reconciliation Specification

## Scope

Define the complete deterministic reconciliation behavior for one completed import batch **before** any engine, persistence, dashboard, or API work.

Stage 5 is delivered as three sequential, specification-only pull requests:

| PR | Branch | Purpose |
| --- | --- | --- |
| 1 | `codex/stage-5-reference-profile` | Reproducible reference-data facts (this PR) |
| 2 | (later) | Business policy: matching, aggregation, findings, impact, metrics |
| 3 | (later) | Final expected reference findings and metrics |

PR 1 establishes independently verified observations from `sample/orders.csv` and `sample/payments.csv`. It does **not** classify business discrepancies, choose tolerances, or calculate disputed value / money at risk.

## Exclusions (all Stage 5 PRs)

- Reconciliation engine implementation (`lib/domain`, feature modules)
- Schema, RPC, API, or UI changes
- Hardcoded source IDs, row positions, or expected finding lists in calculation logic
- LLM involvement in matching, classification, or financial decisions
- Hosted Supabase resets or destructive linked-project operations

## PR 1 deliverables

| Path | Role |
| --- | --- |
| `docs/lld/stage-5-reconciliation-specification.md` | This LLD (profile scope + approval gate) |
| `scripts/profile-reference-data.mjs` | Deterministic reference dataset profiler |
| `package.json` | `profile:reference` script |
| `docs/reconciliation.md` | Independently verified reference observations |
| `PLAN.md` | Stage 5 status |

## Profiling rules (PR 1)

- Reuse PapaParse with `dynamicTyping: false`.
- Parse money into integer minor units without floating-point arithmetic (same decimal rules as Stage 4).
- Normalize identifiers exactly as Stage 4: trim surrounding whitespace, then uppercase.
- Produce stable, sorted JSON (and a human-readable summary).
- Report raw facts only—no finding codes, severity, or risk formulas.
- Do not embed the confirmed baseline counts in calculation logic; compare them only in documentation after a profiler run.

Matching key for profile joins: normalized order `order_id` ↔ normalized payment `order_reference`.

## Stage 4 warnings (unchanged role)

Stage 4 ingestion warnings remain **data-quality observations**, not business discrepancies:

- `MISSING_OR_INVALID_EMAIL`
- `MISSING_ORDER_DISCOUNT`
- `MISSING_PAYMENT_TIMESTAMP`
- `IDENTIFIER_NORMALIZED`

PR 1 records that they exist on the reference import path; it does not reclassify them.

## Approval gate — financial and product decisions (before PR 2)

These decisions are **material** and must be approved explicitly before PR 2. They must not be inferred silently from the profiler output.

| # | Decision | Options / question | Status |
| --- | --- | --- | --- |
| 1 | Monetary tolerance | Zero; one cent inclusive; or another documented value | **Awaiting approval** |
| 2 | “Total orders” definition | 185 source records vs 184 logical normalized order keys | **Awaiting approval** |
| 3 | Reconciliation-rate numerator and denominator | Exact definitions for rate calculation | **Awaiting approval** |
| 4 | Status semantics | Expected behavior for completed, cancelled, and refunded orders | **Awaiting approval** |
| 5 | Duplicate transaction references | Exclude from aggregation vs treat the group as financially indeterminate | **Awaiting approval** |
| 6 | Currency conflicts | How they contribute to disputed value and money at risk **without** cross-currency comparison | **Awaiting approval** |
| 7 | Exact duplicate source rows | Whether reconciliation generates data-quality warnings for them | **Awaiting approval** |
| 8 | Severity rules | Rules without arbitrary monetary thresholds | **Awaiting approval** |
| 9 | Disputed value vs money at risk | Exact distinction between the two metrics | **Awaiting approval** |
| 10 | Group-level exposure | How to avoid summing overlapping findings for the same exposure | **Awaiting approval** |

## Verification (PR 1)

```bash
npm run profile:reference
npm test
npm run typecheck
npm run lint
npm run build
```

Acceptance:

- Profiler results are independent of CSV row ordering.
- Original and normalized identifiers are both visible in the output.
- No reconciliation engine, schema, API, or UI code is added.
- Documented baseline facts match an independent profiler run.

## Verified reference observations (PR 1)

Independent profiler run (`npm run profile:reference`) confirms:

| Fact | Value |
| --- | ---: |
| Order rows | 185 |
| Unique normalized order IDs | 184 |
| Payment rows | 187 |
| Unique transaction references | 187 |
| Unique normalized payment order references | 183 |
| Matched normalized keys | 180 |
| Union normalized keys | 187 |
| Duplicated order group (identical rows) | 1 (`ORD-1004`, source rows 117 and 170) |
| Order keys without payment activity | 4 (`ORD-1201`–`ORD-1204`) |
| Payment references without orders | 3 (`ORD-1301`–`ORD-1303`) |
| Multiple settled charge groups | 2 (`ORD-1501`, `ORD-1502`) |
| Currency conflicts | 2 (`ORD-1601`, `ORD-1602`) |
| Material single-charge amount differences (`\|Δ\| ≥ 3`) | 3 (`ORD-1401`–`ORD-1403`) |
| Sub-three-cent single-charge amount differences (`\|Δ\| ∈ {1,2}`) | 3 (`ORD-1901`–`ORD-1903`) |
| Failed charge / pending charge | 1 / 1 (`TXN700183` / `TXN700184`) |
| Cancelled + settled charge | 1 (`ORD-1701`) |
| Refunded + partial refund | 1 (`ORD-1702`) |
| Completed + full refund | 1 (`ORD-1703`) |
| Order / payment settlement arithmetic failures | 0 / 0 |

Full tables with original and normalized identifiers: `docs/reconciliation.md`.

## Status

| Item | Status |
| --- | --- |
| PR 1 — Reference-data profile | COMPLETE (this PR) |
| Approval gate decisions | **AWAITING APPROVAL** (required before PR 2) |
| PR 2 — Business policy | NOT STARTED |
| PR 3 — Expected reference results | NOT STARTED |

