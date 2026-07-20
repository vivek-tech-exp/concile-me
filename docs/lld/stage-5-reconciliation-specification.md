# Stage 5 LLD — Reconciliation Specification

## Scope

Define the complete deterministic reconciliation behavior for one completed import batch **before** any engine, persistence, dashboard, or API work.

Stage 5 is delivered as three sequential, specification-only pull requests:

| PR | Branch | Purpose |
| --- | --- | --- |
| 1 | `codex/stage-5-reference-profile` | Reproducible reference-data facts |
| 2 | (later) | Business policy: matching, aggregation, findings, impact, metrics |
| 3 | (later) | Final expected reference findings and metrics |

PR 1 establishes independently verified observations from `sample/orders.csv` and `sample/payments.csv`. It reports raw structural facts only. Business classification, severity assignment, and financial metrics are defined by the approval gate below and implemented in later PRs—not by the profiler.

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
- Report raw facts only—no finding codes, severity, tolerance bands, or risk formulas.
- Emit a neutral, sorted list of non-zero amount differences; do not label them “material” or similar.
- Do not embed confirmed baseline counts in calculation logic; compare them only in documentation after a profiler run.

Matching key for profile joins: normalized order `order_id` ↔ normalized payment `order_reference`.

## Stage 4 warnings (unchanged role)

Stage 4 ingestion warnings remain **data-quality observations**, not business discrepancies:

- `MISSING_OR_INVALID_EMAIL`
- `MISSING_ORDER_DISCOUNT`
- `MISSING_PAYMENT_TIMESTAMP`
- `IDENTIFIER_NORMALIZED`

They keep severity **low**. Reconciliation may emit additional data-quality findings (see #7).

## Approval gate — financial and product decisions (before PR 2)

These decisions are **final** for Stage 5 PR 2. They must not be re-inferred from profiler output.

| # | Decision | Status |
| --- | --- | --- |
| 1 | Monetary tolerance | **Approved** |
| 2 | Total orders | **Approved** |
| 3 | Reconciliation rate | **Approved** |
| 4 | Status / expected net collected | **Approved** |
| 5 | Duplicate transaction references | **Approved** |
| 6 | Currency conflicts | **Approved** |
| 7 | Exact duplicate source rows | **Approved** |
| 8 | Severity | **Approved** |
| 9 | Disputed value vs money at risk | **Approved** |
| 10 | Group-level exposure | **Approved** |

### 1. Monetary tolerance

**v1 constant:** `AMOUNT_TOLERANCE_MINOR = 10` (ten stored minor units; ±0.10 inclusive in two-decimal currencies).

- Documented and versioned in the domain policy / LLD; **not** read from environment variables.
- Identical inputs always yield identical results for a given policy version.
- Future configurability requires the tolerance to be an explicit engine input **and** persisted with each reconciliation result. That is out of scope for v1.

### 2. Total orders

**Total orders** = count of **source order rows** in the import batch (185 for the reference pair), including duplicate rows. Not the count of unique normalized order keys (184).

### 3. Reconciliation rate

```text
reconciliation_rate = reconciled_source_order_rows / total_source_order_rows
```

An order **source row** is **reconciled** only when **all** of the following hold for its normalized-key group:

1. The group is **determinate** (not indeterminate under #5 or #7).
2. Order and payment currencies **agree** (no currency conflict under #6).
3. Actual net collected versus expected net collected is within `AMOUNT_TOLERANCE_MINOR` (inclusive).
4. The group has no blocking data-quality condition that marks it indeterminate.

If a normalized-key group is **indeterminate**, **none** of its order source rows count in the numerator (including both rows of an exact duplicate pair).

Identifier-only matches without a valid financial state do **not** count as reconciled.

### 4. Status semantics — expected net collected

Allowed order statuses are those present after Stage 4 normalization: `completed`, `cancelled`, `refunded`. No invented lifecycle transitions.

| Normalized order status | Expected net collected |
| --- | --- |
| `completed` | Order `net_amount_minor` |
| `cancelled` | `0` |
| `refunded` | `0` |

**Actual net collected** (per normalized-key group, when determinate and single-currency):

```text
actual_net_collected =
  sum(settled charge amounts)
  − sum(settled refund amounts)
```

Exclude from that sum:

- Fees
- Failed attempts
- Pending attempts
- All payment events whose normalized `transaction_ref` is a **duplicate transaction ID** anywhere in the import (#5)

**Orphan payment group** (payment order references with no matching order): expected net collected is `0`; actual is computed as above when determinate.

### 5. Duplicate transaction references (global scope)

A normalized `transaction_ref` that appears more than once **anywhere** in the import batch (across any order references) is a **duplicate transaction ID**.

Consequences:

- Every payment event carrying that ID is **excluded from aggregation**.
- Every normalized-key group that contains at least one such event is **financially indeterminate**.
- Do not produce a single reconciled net figure for an indeterminate group.

### 6. Currency conflicts

When order-side and payment-side currencies disagree on a normalized key:

- Emit a **currency conflict** finding.
- Report each currency-side fact separately.
- Do **not** convert, pick a canonical currency, or compute a cross-currency impact.
- The group is **not** reconciled (#3).
- Dashboard monetary exposure for that group follows #9/#10 (no cross-currency impact calculation).

### 7. Exact duplicate source rows

When two or more order source rows share the same normalized key and are **byte-identical** (exact duplicate content):

- Emit a reconciliation **data-quality** finding.
- Mark that normalized-key group **indeterminate**.
- **Never** silently deduplicate for matching or aggregation.

### 8. Severity

| Severity | Applies to |
| --- | --- |
| `high` | Known settled financial inconsistency, or missing expected collection |
| `medium` | Pending, failed, currency-conflicted, or otherwise indeterminate groups |
| `low` | Non-financial data-quality warnings (Stage 4 ingestion warnings and exact-duplicate-row findings) |

### 9. Disputed value vs money at risk

Counted **once per normalized key and currency** from canonical group exposure (#10)—never by summing finding impacts.

| Metric | Definition |
| --- | --- |
| **Disputed value** | Full value requiring investigation for that group/currency (the investigated exposure amount for the group). |
| **Money at risk** | `abs(actual_net_collected − expected_net_collected)` when both sides are defined in the **same** currency and the group is determinate enough to compute both. |

Currency-conflicted groups: report currency-side facts; **return no cross-currency impact** for either metric.

Orphan payment groups: expected = 0; money at risk = `abs(actual − 0)` when determinate and single-currency.

Finding `financial_impact_minor` values are **explanatory only**.

### 10. Group-level exposure

- Dashboard metrics (reconciled value, disputed value, money at risk) are derived from **canonical per-(normalized key, currency) group exposure**.
- Finding impacts are explanatory and must **never** be summed to produce dashboard totals.
- Overlapping findings on the same group do not multiply exposure.

### Canonical group model (summary)

```text
expected_net_collected =
  completed → order net_amount_minor
  cancelled → 0
  refunded  → 0
  orphan payment group → 0

actual_net_collected =
  settled charges − settled refunds
  (exclude fees, failed, pending, and duplicate transaction IDs)

reconciled order row ↔ group determinate ∧ currencies agree
  ∧ |actual − expected| ≤ 10 ∧ no blocking DQ indeterminacy

reconciliation_rate = reconciled_source_order_rows / total_source_order_rows
```

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
- Profiler amount differences are neutral (no material/tolerance-band labels).

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
| Non-zero single-settled-charge amount differences | 6 |
| Failed charge / pending charge | 1 / 1 (`TXN700183` / `TXN700184`) |
| Cancelled + settled charge | 1 (`ORD-1701`) |
| Refunded + partial refund | 1 (`ORD-1702`) |
| Completed + full refund | 1 (`ORD-1703`) |
| Order / payment settlement arithmetic failures | 0 / 0 |

Full tables with original and normalized identifiers: `docs/reconciliation.md`.

## Status

| Item | Status |
| --- | --- |
| PR 1 — Reference-data profile | COMPLETE |
| Approval gate decisions | **COMPLETE** — all ten decisions approved |
| PR 2 — Business policy | NOT STARTED (unblocked for policy writing) |
| PR 3 — Expected reference results | NOT STARTED |
