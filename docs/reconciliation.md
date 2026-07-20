# Reconciliation

This document is the product-facing reconciliation specification for Stage 5.

- **Part A** — Independently verified reference-data observations (PR 1).
- **Part B** — Deterministic business policy (PR 2).

Expected findings and metric totals for the reference CSV pair are published in Stage 5 PR 3. They must be derived from this policy—not hardcoded into the engine.

Normative implementable detail: `docs/lld/stage-5-reconciliation-specification.md`.

---

## Part A — Reference-data observations (PR 1)

Reproduce:

```bash
npm run profile:reference
```

The profiler reports raw facts only (no finding classification). Money and identifier rules mirror Stage 4.

### Summary counts

| Fact | Value |
| --- | ---: |
| Order rows | 185 |
| Unique normalized order IDs | 184 |
| Payment rows | 187 |
| Unique transaction references | 187 |
| Unique normalized payment order references | 183 |
| Matched normalized keys (`order_id` ∩ `order_reference`) | 180 |
| Union of normalized keys | 187 |
| Order keys without payment activity | 4 |
| Payment references without orders | 3 |
| Duplicated order groups | 1 (two identical rows) |
| Groups with multiple settled charges | 2 |
| Order/payment currency conflicts | 2 |
| Non-zero amount differences (single settled charge, same currency) | 6 |
| Failed charges | 1 |
| Pending charges | 1 |
| Cancelled orders with a settled charge | 1 |
| Refunded orders with a partial settled refund | 1 |
| Completed orders with a full settled refund | 1 |
| Order arithmetic failures | 0 |
| Payment settlement arithmetic failures | 0 |

### Matching key (profile joins)

Normalized order `order_id` ↔ normalized payment `order_reference` (trim + uppercase).

### Notable structural facts

| Observation | Keys / refs |
| --- | --- |
| Exact duplicate order rows | `ORD-1004` (source rows 117, 170) |
| Orders without payments | `ORD-1201`–`ORD-1204` |
| Payments without orders | `ORD-1301`–`ORD-1303` |
| Multiple settled charges | `ORD-1501`, `ORD-1502` |
| Currency conflicts | `ORD-1601` (USD vs EUR), `ORD-1602` (EUR vs USD) |
| Non-zero amount deltas | `ORD-1401` (2500), `ORD-1402` (1850), `ORD-1403` (6000), `ORD-1901` (1), `ORD-1902` (2), `ORD-1903` (1) |
| Failed / pending | `TXN700183` / `TXN700184` |
| Cancelled + settled charge | `ORD-1701` |
| Refunded + partial refund | `ORD-1702` |
| Completed + full refund | `ORD-1703` |

Stage 4’s five ingestion warnings remain data-quality observations (severity `low`), not business discrepancies.

---

## Part B — Business policy (PR 2)

| Constant | Value |
| --- | --- |
| Policy version | `stage-5-pr2-v1` |
| Amount tolerance | **10** minor units inclusive (`AMOUNT_TOLERANCE_MINOR`) |

Tolerance is a versioned domain constant. It is not environment-configurable in v1.

### Matching and grouping

1. Normalize identifiers as in Stage 4 (trim, uppercase).
2. Group by normalized order `order_id` / payment `order_reference`.
3. Every distinct key in the union of order keys and payment references is one group.

### Expected vs actual net collected

**Expected** (when the group has exactly one order row):

| Order status | Expected net collected |
| --- | --- |
| `completed` | Order `net_amount_minor` |
| `cancelled` | `0` |
| `refunded` | `0` |

Orphan payment groups (no orders): expected = `0`.

**Actual** (when financially determinate):

```text
settled charges − settled refunds
```

Exclude fees, failed attempts, pending attempts, and every payment whose normalized `transaction_ref` is duplicated **anywhere** in the import.

### When a group is indeterminate

- Any payment with a globally duplicated `transaction_ref`, or
- Exact duplicate order source rows on the key, or
- Non-identical colliding order rows on the same key.

Indeterminate groups do not produce a reconciled net; none of their order rows count toward the reconciliation-rate numerator.

### Reconciled order row

A source order row is reconciled only if its group is determinate, currencies agree, expected and actual are defined, and `|actual − expected| ≤ 10`.

### Dashboard metrics

| Metric | Definition |
| --- | --- |
| Total orders | Source order row count (185 for the reference pair) |
| Total payments | Source payment row count (187 for the reference pair) |
| Reconciliation rate | Reconciled source order rows ÷ total source order rows |
| Reconciled value | Per currency: sum of `expected` for groups within tolerance |
| Money at risk | Per currency: sum of `|actual − expected|` for determinate single-currency groups outside tolerance |
| Disputed value | Per currency: sum of `max(expected, actual)` for those same out-of-tolerance groups |

Currency-conflicted or indeterminate groups contribute **0** to reconciled value, money at risk, and disputed value. Finding-level impacts are explanatory and must never be summed into these totals.

### Finding types (summary)

| Code | Severity | Meaning |
| --- | --- | --- |
| `EXACT_DUPLICATE_ORDER_ROWS` | low | Identical duplicate order rows; group indeterminate |
| `ORDER_KEY_COLLISION` | medium | Non-identical orders share a key; group indeterminate |
| `DUPLICATE_TRANSACTION_REF` | medium | Group touches a globally duplicated transaction id |
| `CURRENCY_CONFLICT` | medium | Order/payment currencies disagree; no FX |
| `PENDING_CHARGE` | medium | Pending charge present |
| `FAILED_CHARGE` | medium | Failed charge present |
| `AMOUNT_MISMATCH` | high | `|actual − expected| > 10` |
| `MISSING_PAYMENT` | high | Orders present, no payments, expected > 0 |
| `UNEXPECTED_PAYMENT` | high | Payments without orders and non-zero actual |
| `ORDER_ARITHMETIC_MISMATCH` | low | Order gross/discount/net arithmetic fails |

Cancelled or refunded orders with unexpected settled collection are `AMOUNT_MISMATCH` (expected is 0)—no separate status code.

### Severity model

| Severity | Use |
| --- | --- |
| high | Settled financial inconsistency or missing expected collection |
| medium | Pending, failed, currency conflict, or indeterminate structure |
| low | Non-financial data-quality warnings |

### Explicit non-goals

- No fuzzy matching, FX conversion, or silent deduplication.
- No fees in net-collected comparison.
- No LLM classification or hardcoded source IDs in rules.

Full detection tables, non-triggering cases, pipeline order, and sort keys: `docs/lld/stage-5-reconciliation-specification.md`.
