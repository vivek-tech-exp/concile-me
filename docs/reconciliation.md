# Reconciliation — Reference Data Observations

This document records independently verified facts from the Stage 5 PR 1 profiler run against `sample/orders.csv` and `sample/payments.csv`.

It does **not** define business discrepancy rules, tolerance, severity, disputed value, money at risk, or dashboard metrics. Those decisions require explicit approval in `docs/lld/stage-5-reconciliation-specification.md` before Stage 5 PR 2.

Reproduce:

```bash
npm run profile:reference
```

The profiler shuffles inputs and asserts identical sorted output. Money parsing and identifier normalization mirror Stage 4 (trim + uppercase for IDs; exact decimal → integer minor units).

## Summary counts

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
| Material amount differences (`|Δ| ≥ 3` minor units, single settled charge) | 3 |
| Sub-three-cent amount differences (`|Δ| ∈ {1, 2}`, single settled charge) | 3 |
| Failed charges | 1 |
| Pending charges | 1 |
| Cancelled orders with a settled charge | 1 |
| Refunded orders with a partial settled refund | 1 |
| Completed orders with a full settled refund | 1 |
| Order arithmetic failures (`gross − discount ≠ net`) | 0 |
| Payment settlement arithmetic failures (`amount − fee ≠ net_settled`) | 0 |

Amount-difference bands above are **descriptive profile labels only**. Whether `|Δ| ≤ 2` is tolerated in reconciliation is an approval-gate decision for PR 2.

## Matching key used for profile joins

Normalized order `order_id` ↔ normalized payment `order_reference` (Stage 4 identifier normalization).

## Structural observations

### Duplicated order group (identical rows)

| Normalized order ID | Source rows | Original order ID | Identical |
| --- | --- | --- | --- |
| `ORD-1004` | 117, 170 | `ORD-1004` / `ORD-1004` | Yes |

### Order keys without payment activity

| Normalized order ID |
| --- |
| `ORD-1201` |
| `ORD-1202` |
| `ORD-1203` |
| `ORD-1204` |

### Payment references without orders

| Normalized order reference |
| --- |
| `ORD-1301` |
| `ORD-1302` |
| `ORD-1303` |

### Multiple settled charges

| Normalized key | Settled charges (original → normalized payment ID) | Amounts (minor) |
| --- | --- | --- |
| `ORD-1501` | `TXN700167` → `TXN700167` (row 11); `TXN700168` → `TXN700168` (row 124) | 11984; 11984 |
| `ORD-1502` | `TXN700169` → `TXN700169` (row 44); `TXN700170` → `TXN700170` (row 81) | 12874; 12874 |

### Currency conflicts

| Normalized key | Order currency (original → normalized) | Payment currency (original → normalized) |
| --- | --- | --- |
| `ORD-1601` | `USD` → `USD` (order row 2) | `EUR` → `EUR` (`TXN700171`, payment row 120) |
| `ORD-1602` | `EUR` → `EUR` (order row 22) | `USD` → `USD` (`TXN700172`, payment row 117) |

No cross-currency amount comparison was performed.

### Amount differences (single settled charge, same currency)

Material (`|Δ| ≥ 3`):

| Normalized key | Order net (minor) | Settled charge (minor) | \|Δ\| | Payment |
| --- | ---: | ---: | ---: | --- |
| `ORD-1401` | 9281 | 11781 | 2500 | `TXN700164` |
| `ORD-1402` | 12762 | 10912 | 1850 | `TXN700165` |
| `ORD-1403` | 19901 | 25901 | 6000 | `TXN700166` |

Sub-three-cent (`|Δ| ∈ {1, 2}`):

| Normalized key | Order net (minor) | Settled charge (minor) | \|Δ\| | Payment |
| --- | ---: | ---: | ---: | --- |
| `ORD-1901` | 13538 | 13539 | 1 | `TXN700180` |
| `ORD-1902` | 6865 | 6863 | 2 | `TXN700181` |
| `ORD-1903` | 15496 | 15497 | 1 | `TXN700182` |

### Payment status events

| Kind | Normalized payment ID | Original payment ID | Normalized order reference | Amount (minor) | Currency |
| --- | --- | --- | --- | ---: | --- |
| Failed charge | `TXN700183` | `TXN700183` | `ORD-2001` | 31000 | USD |
| Pending charge | `TXN700184` | `TXN700184` | `ORD-2002` | 6700 | USD |

### Status / refund patterns

| Pattern | Normalized key | Notes |
| --- | --- | --- |
| Cancelled order with settled charge | `ORD-1701` | Order net 17500 USD; one settled charge |
| Refunded order with partial refund | `ORD-1702` | Order net 24000; settled refund sum 12000 |
| Completed order with full refund | `ORD-1703` | Order net 9900; settled refund sum 9900 |

## Stage 4 data-quality warnings

The reference CSV pair still produces Stage 4’s five ingestion warnings on import. They remain **data-quality observations**, not business discrepancies. Classification of reconciliation-generated warnings (for example exact duplicate source rows) is deferred to the approval gate / PR 2.

## Deferred to Stage 5 PR 2+

- Finding codes, severity, and false-positive exclusions
- Tolerance and whether sub-three-cent gaps are findings
- Metric definitions (total orders, reconciliation rate, reconciled / disputed / at-risk value)
- How overlapping group observations contribute to exposure without double counting

See the approval gate table in `docs/lld/stage-5-reconciliation-specification.md`.
