# Stage 5 LLD — Reconciliation Specification

## Scope

Define the complete deterministic reconciliation behavior for one completed import batch **before** any engine, persistence, dashboard, or API work.

Stage 5 is delivered as three sequential, specification-only pull requests:

| PR | Branch | Purpose |
| --- | --- | --- |
| 1 | `codex/stage-5-reference-profile` | Reproducible reference-data facts |
| 2 | `codex/stage-5-business-policy` | Business policy: matching, aggregation, findings, impact, metrics |
| 3 | (later) | Final expected reference findings and metrics |

PR 1 records raw structural facts. PR 2 (this section onward under **Business policy**) turns the approved gate into implementable rules. PR 3 will publish independently calculated expected findings and metrics for the reference pair—without hardcoding those expectations into the engine.

## Exclusions (all Stage 5 PRs)

- Reconciliation engine implementation (`lib/domain`, feature modules)
- Schema, RPC, API, or UI changes
- Hardcoded source IDs, row positions, or expected finding lists in calculation logic
- LLM involvement in matching, classification, or financial decisions
- Hosted Supabase resets or destructive linked-project operations

## PR 1 deliverables

| Path | Role |
| --- | --- |
| `docs/lld/stage-5-reconciliation-specification.md` | This LLD |
| `scripts/profile-reference-data.mjs` | Deterministic reference dataset profiler |
| `package.json` | `profile:reference` script |
| `docs/reconciliation.md` | Observations + (PR 2) product-facing rules |
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

They keep severity **low**. They are import-time findings (`reconciliation_id IS NULL`). Reconciliation may emit additional findings during Stage 6; Stage 4 warnings are not re-derived by the engine.

## Approval gate — financial and product decisions

All ten decisions are **Approved**. Full text is retained below as the normative source for PR 2. Do not re-infer from profiler output.

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

### Gate detail (normative)

**1. Monetary tolerance.** `AMOUNT_TOLERANCE_MINOR = 10`. Versioned domain constant—not environment-configurable in v1. Future configurability requires explicit engine input and persistence with each result.

**2. Total orders.** Count of source order rows in the import (185 for the reference pair), including duplicates.

**3. Reconciliation rate.** `reconciled_source_order_rows / total_source_order_rows`. A source order row is reconciled only when its normalized-key group is determinate, currencies agree, `|actual − expected| ≤ 10`, and there is no blocking DQ indeterminacy. Indeterminate groups contribute **zero** order rows to the numerator.

**4. Status → expected net collected.** `completed` → order `net_amount_minor`; `cancelled` → `0`; `refunded` → `0`. Orphan payment groups → expected `0`.

**5. Duplicate transaction references.** A normalized `transaction_ref` appearing more than once **anywhere** in the import is a duplicate transaction ID. Exclude every such event from aggregation; mark every group containing one **financially indeterminate**.

**6. Currency conflicts.** Emit a conflict finding; report currency-side facts; no FX, no cross-currency impact, group not reconciled.

**7. Exact duplicate source rows.** Emit DQ finding; mark group indeterminate; never silently deduplicate.

**8. Severity.** `high` = settled financial inconsistency or missing expected collection; `medium` = pending, failed, currency-conflicted, or otherwise indeterminate; `low` = non-financial DQ warnings.

**9–10. Metrics / exposure.** Dashboard totals from canonical per-(normalized key, currency) group exposure. Finding impacts are explanatory only—never summed into dashboard metrics.

---

## Business policy (PR 2)

Product-facing summary: `docs/reconciliation.md`. This section is the implementable contract for Stage 6.

### Policy version

| Constant | Value |
| --- | --- |
| `POLICY_VERSION` | `stage-5-pr2-v1` |
| `AMOUNT_TOLERANCE_MINOR` | `10` |

### Inputs

One completed import batch’s order records and payment records after Stage 4 validation. The engine must not use wall-clock time, database return order, React, Supabase, HTTP, or an LLM.

### Pipeline (deterministic order)

1. Build the global set of **duplicate transaction IDs** (normalized `transaction_ref` with count > 1 across the whole import).
2. Partition records into **normalized-key groups** (see matching).
3. For each group, evaluate **determinacy**, **currency agreement**, **expected**, **actual**, and **findings**.
4. Compute **per-group exposure** (reconciled contribution, disputed, money at risk).
5. Aggregate **batch metrics** by currency (and rate from source order rows).
6. Emit findings in **stable sort order**.

### Matching key

| Side | Original field | Normalized field | Rule |
| --- | --- | --- | --- |
| Order | `original_order_id` | `normalized_order_id` | Stage 4: trim + uppercase |
| Payment | `original_order_reference` | `normalized_order_reference` | Stage 4: trim + uppercase |

**Group key** = that normalized string. Union of all order keys and payment reference keys forms the set of groups. Empty keys cannot appear after Stage 4 validation.

### Payment event classification

| Normalized type | Normalized status | Role in `actual_net_collected` |
| --- | --- | --- |
| `charge` | `settled` | Include `amount_minor` (+) if transaction ID is not a duplicate |
| `refund` | `settled` | Include `amount_minor` (−) if transaction ID is not a duplicate |
| `charge` | `pending` | Exclude from actual; may emit `PENDING_CHARGE` |
| `charge` | `failed` | Exclude from actual; may emit `FAILED_CHARGE` |
| `refund` | `pending` / `failed` | Exclude from actual; emit corresponding finding if present |

Fees (`fee_minor`) never enter `actual_net_collected`.

```text
actual_net_collected =
  Σ settled non-duplicate charge amounts
  − Σ settled non-duplicate refund amounts
```

When the group is **financially indeterminate** (#5 or #7 or order-key collision), `actual_net_collected` is **undefined** (do not invent a net).

### Expected net collected

| Group shape | Expected |
| --- | --- |
| Exactly one order row; status `completed` | that row’s `net_amount_minor` |
| Exactly one order row; status `cancelled` | `0` |
| Exactly one order row; status `refunded` | `0` |
| Two or more **exact-identical** order rows | undefined (indeterminate) |
| Two or more **non-identical** order rows on the same key | undefined (indeterminate) |
| No order rows (orphan payments only) | `0` |

When multiple identical order rows exist, do not pick one for expected; leave expected undefined until the DQ finding is resolved outside the engine.

### Determinacy

A group is **indeterminate** when any of:

1. It contains a payment whose normalized `transaction_ref` is a global duplicate transaction ID.
2. It has two or more order rows that are exact content duplicates (`EXACT_DUPLICATE_ORDER_ROWS`).
3. It has two or more order rows that are **not** exact duplicates (`ORDER_KEY_COLLISION`).

Otherwise the group is **determinate**.

### Currency agreement

Collect distinct normalized currencies from order rows and from payment rows in the group (payments still counted even if excluded from actual).

- **Agree** when the set of currencies has size 1 (or the group has only one side and one currency).
- **Conflict** when size > 1 → emit `CURRENCY_CONFLICT`; currencies do not agree; no cross-currency impact.

### Reconciled source order row

An order **source row** is reconciled iff:

1. Its group is determinate.
2. Currencies agree.
3. `expected` and `actual` are both defined.
4. `abs(actual − expected) ≤ AMOUNT_TOLERANCE_MINOR`.
5. No blocking DQ indeterminacy on the group.

If the group is indeterminate, **every** order source row in that group fails the reconciled predicate.

### Finding catalog

Each finding has: stable `code`, `category`, `severity`, message template, lineage, explanatory `financial_impact_minor` (nullable), and non-triggering notes.

Finding impacts are **explanatory only**. Dashboard metrics use canonical group exposure only.

#### Data-quality / determinacy

| Code | Category | Severity | Detection | Explanatory impact | Non-triggering |
| --- | --- | --- | --- | --- | --- |
| `EXACT_DUPLICATE_ORDER_ROWS` | `data_quality` | `low` | ≥2 order rows same key with identical fingerprint of persisted source fields | `null` | Distinct content on same key → `ORDER_KEY_COLLISION` instead |
| `ORDER_KEY_COLLISION` | `data_quality` | `medium` | ≥2 order rows same key, not all identical | `null` | Single order row; or all rows identical |
| `DUPLICATE_TRANSACTION_REF` | `data_quality` | `medium` | Group contains ≥1 payment whose normalized payment ID is globally duplicated | `null` | Unique transaction refs only |

#### Currency

| Code | Category | Severity | Detection | Explanatory impact | Non-triggering |
| --- | --- | --- | --- | --- | --- |
| `CURRENCY_CONFLICT` | `business` | `medium` | Order-side and payment-side currency sets disagree (size > 1 across the group) | `null` (no cross-currency number) | Single shared currency; or only one side present |

#### Payment state (informational; do not alone define actual)

| Code | Category | Severity | Detection | Explanatory impact | Non-triggering |
| --- | --- | --- | --- | --- | --- |
| `PENDING_CHARGE` | `business` | `medium` | ≥1 `charge`+`pending` in group (non-duplicate txn id) | pending `amount_minor` (same payment currency) | No pending charges |
| `FAILED_CHARGE` | `business` | `medium` | ≥1 `charge`+`failed` in group (non-duplicate txn id) | failed `amount_minor` | No failed charges |

One finding per distinct pending/failed payment row (stable lineage to that payment). Multiple events → multiple findings.

#### Financial state (determinate, currencies agree)

| Code | Category | Severity | Detection | Explanatory impact | Non-triggering |
| --- | --- | --- | --- | --- | --- |
| `AMOUNT_MISMATCH` | `business` | `high` | `expected` and `actual` defined; `abs(actual − expected) > 10` | `abs(actual − expected)` | Difference ≤ 10; or expected/actual undefined; or currency conflict; or indeterminate |
| `MISSING_PAYMENT` | `business` | `high` | Group has ≥1 order row, zero payment rows, and `expected` defined and `expected > 0` | `expected` | Orphan-only groups; cancelled/refunded with expected 0 and no payments (no missing collection); expected undefined |
| `UNEXPECTED_PAYMENT` | `business` | `high` | Group has zero order rows and `actual` defined and `actual ≠ 0` (beyond tolerance vs expected 0) | `abs(actual)` | Orphan group with actual within 10 of 0; or indeterminate actual |
| `ORDER_ARITHMETIC_MISMATCH` | `data_quality` | `low` | For an order row with non-null `discount_minor`: `gross − discount ≠ net`; or with null discount: `gross ≠ net` | `null` | Arithmetic holds |

Notes:

- `cancelled`/`refunded` with non-zero actual are covered by `AMOUNT_MISMATCH` (expected 0), not a separate code.
- Multiple distinct settled charges are aggregated into `actual`; if the sum is out of tolerance, emit `AMOUNT_MISMATCH`. Do **not** emit a separate “duplicate charge” financial code when transaction IDs are unique.
- `MISSING_PAYMENT` applies when there are no payment rows at all. A completed order with only failed/pending payments has `actual = 0` and should emit `AMOUNT_MISMATCH` (and pending/failed findings), not `MISSING_PAYMENT`.

### Canonical group exposure (dashboard inputs)

Evaluate once per `(normalized_key, currency)` when currencies agree and a single currency `C` is in use. If currency conflict or indeterminate such that expected/actual are undefined:

| Metric contribution | Value |
| --- | --- |
| Reconciled value in `C` | `0` |
| Money at risk in `C` | `0` |
| Disputed value in `C` | `0` |

When the group is determinate, currencies agree on `C`, and expected + actual are defined:

| Condition | Reconciled value (`C`) | Money at risk (`C`) | Disputed value (`C`) |
| --- | --- | --- | --- |
| `abs(actual − expected) ≤ 10` | `expected` | `0` | `0` |
| otherwise | `0` | `abs(actual − expected)` | `max(expected, actual)` |

Batch totals: sum group contributions **per currency**. Never sum finding explanatory impacts.

**Total payments** = count of payment source rows in the import (187 for the reference pair).

**Reconciliation rate** = (count of reconciled order source rows) / (total order source rows). Report as a ratio in `[0, 1]` (UI may format as percent).

### Finding sort order

Stable ascending by:

1. `sort_key` string: `{normalized_key}:{code}:{stable_tie_breaker}`
2. Tie-breaker: minimum source row number among linked lineage rows (orders first, then payments), then finding code, then payment/order id string.

Engine output must sort findings explicitly; never rely on map iteration order.

### False positives / non-goals

- Do not treat Stage 4 email/discount/timestamp/identifier warnings as business discrepancies.
- Do not convert currencies.
- Do not fuzzy-match identifiers.
- Do not use fees in net-collected comparisons.
- Do not silently drop duplicate order rows.
- Do not count the same group’s exposure more than once across findings.

### PR 2 deliverables

| Path | Role |
| --- | --- |
| `docs/lld/stage-5-reconciliation-specification.md` | Full implementable policy (this document) |
| `docs/reconciliation.md` | Product-facing rules + retained PR 1 observations |
| `PLAN.md` | Note PR 2 progress |

### PR 2 verification

```bash
npm run profile:reference
npm test
npm run typecheck
npm run lint
npm run build
```

Acceptance:

- Every finding code has inputs, detection, severity, explanatory impact, and non-triggering cases.
- Rate, totals, expected/actual, tolerance, duplicate scope, currency, and exposure rules are unambiguous.
- No engine, schema, API, or UI code.
- No hardcoded reference source IDs in policy logic (IDs may appear only in PR 1 observation tables).

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

Full observation tables: `docs/reconciliation.md`.

## Status

| Item | Status |
| --- | --- |
| PR 1 — Reference-data profile | COMPLETE |
| Approval gate decisions | COMPLETE |
| PR 2 — Business policy | IN PROGRESS |
| PR 3 — Expected reference results | NOT STARTED |
