# Stage 3 LLD — Database Model and User Isolation

## Scope

Create the minimal persistent model for user-owned import batches, source rows, current reconciliations, metrics, and findings. Enforce ownership with RLS and transactional RPC boundaries. Cascade deletion is the **approved** deletion behavior.

## Exclusions

- CSV parsing, file upload UI, and Stage 4 source validation
- Reconciliation rules, engine code, and Stage 5–6 domain semantics
- Dashboard UI, LLM explanations, migrations, service-role keys
- Deployment or modification of external production services

## Approved decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Deletion | `ON DELETE CASCADE` from `auth.users` through the full application chain | Explicitly approved for Stage 3; deleting a user removes all owned application data |
| Schema location | Single `supabase/schema.sql` | `AGENTS.md` / `PLAN.md`; no migration files |
| Multi-table writes | `SECURITY DEFINER` RPCs only | Atomic import and reconciliation replacement; direct table DML denied |
| Ownership | `auth.uid()` only; never accept client `user_id` | Matches HLD security model |
| Money | `bigint` minor units + uppercase ISO-4217-style currency | No floating-point; safe-integer bounds for JSON API |
| Current reconciliation | At most one row per import (`UNIQUE (import_batch_id)`) | Replacement deletes prior current result then inserts |
| Import warnings | Findings with `reconciliation_id IS NULL` and `category = 'data_quality'` | Cascade with import; preserved across reconciliation replacement |

## Cascade chain

```text
auth.users
└── import_batches
    ├── order_records
    ├── payment_records
    ├── findings (import-time warnings; reconciliation_id NULL)
    └── reconciliations
        ├── reconciliation_currency_metrics
        └── findings (business findings; reconciliation_id set)
            ├── finding_order_records
            └── finding_payment_records
```

## Tables and columns

All user-owned tables:

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE`
- `created_at timestamptz NOT NULL DEFAULT now()`

Child import-scoped tables also have `import_batch_id uuid NOT NULL`.

Composite foreign keys bind `(import_batch_id, user_id)` → `import_batches (id, user_id)` so a child cannot attach to another user’s import.

### `import_batches`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid | Owner |
| `status` | text | `processing` \| `completed` only for persisted usable states; RPC starts `processing`, ends `completed` |
| `orders_filename` | text NOT NULL | Source file identity |
| `payments_filename` | text NOT NULL | Source file identity |
| `idempotency_key` | text NOT NULL | Unique per user |
| `created_at` / `updated_at` | timestamptz | |

Constraints:

- `UNIQUE (user_id, idempotency_key)`
- `UNIQUE (id, user_id)` (supports composite FKs)
- `CHECK (status IN ('processing', 'completed'))`
- Indexes: `(user_id)`, `(user_id, created_at DESC)`

### `order_records`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` / `import_batch_id` | uuid | Ownership + import scope |
| `source_row_number` | integer NOT NULL | 1-based CSV row |
| `original_order_id` | text NOT NULL | As in source |
| `normalized_order_id` | text NOT NULL | For matching (Stage 4+ fills) |
| `original_status` | text NOT NULL | |
| `normalized_status` | text NOT NULL | |
| `original_currency` | text NOT NULL | |
| `normalized_currency` | text NOT NULL | Uppercase ISO-style |
| `original_amount` | text NOT NULL | Raw monetary string |
| `amount_minor` | bigint NOT NULL | Normalized minor units |
| `original_order_date` | text NOT NULL | Raw date string |
| `order_date` | date NULL | Parsed when valid |
| `created_at` | timestamptz | |

Constraints:

- `UNIQUE (import_batch_id, source_row_number)`
- `UNIQUE (id, import_batch_id, user_id)` for lineage FKs
- Currency check on `normalized_currency`
- Amount within safe-integer bounds
- Indexes: `(user_id)`, `(import_batch_id)`, `(import_batch_id, normalized_order_id)`

### `payment_records`

Same ownership and money/date pattern as orders, plus:

| Column | Type | Notes |
| --- | --- | --- |
| `original_payment_id` / `normalized_payment_id` | text | Payment event id |
| `original_order_reference` / `normalized_order_reference` | text | Link key to orders |
| `original_type` / `normalized_type` | text | charge/refund/etc. (opaque until Stage 4–5) |
| `original_status` / `normalized_status` | text | |
| `original_transaction_date` | text | |
| `transaction_date` | date NULL | Parsed |

Constraints mirror orders; index `(import_batch_id, normalized_order_reference)`.

### `reconciliations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` / `import_batch_id` | uuid | |
| `total_orders` | integer NOT NULL | Count metric |
| `total_payments` | integer NOT NULL | Count metric |
| `created_at` | timestamptz | |

Constraints:

- `UNIQUE (import_batch_id)` — one current result per import
- `UNIQUE (id, import_batch_id, user_id)`

### `reconciliation_currency_metrics`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` / `import_batch_id` / `reconciliation_id` | uuid | |
| `currency` | text NOT NULL | Uppercase ISO-style |
| `reconciled_value_minor` | bigint NOT NULL | |
| `disputed_value_minor` | bigint NOT NULL | |
| `money_at_risk_minor` | bigint NOT NULL | |

Constraints:

- `UNIQUE (reconciliation_id, currency)`
- Composite FK to reconciliation including user + import
- Safe-integer and currency checks

### `findings`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` / `import_batch_id` | uuid | Always set |
| `reconciliation_id` | uuid NULL | NULL = import-time data-quality warning |
| `category` | text | `data_quality` \| `business` |
| `code` | text NOT NULL | Stable finding type code (opaque until Stage 5) |
| `severity` | text NOT NULL | Opaque until Stage 5; non-empty |
| `message` | text NOT NULL | Human-readable summary |
| `currency` | text NULL | When impact is monetary |
| `financial_impact_minor` | bigint NULL | |
| `sort_key` | text NOT NULL | Deterministic ordering key |
| `created_at` | timestamptz | |

Constraints:

- Import warning: `reconciliation_id IS NULL` ⇒ `category = 'data_quality'`
- Business finding: `reconciliation_id IS NOT NULL` ⇒ `category = 'business'`
- Composite uniqueness for lineage parents: `UNIQUE (id, import_batch_id, user_id)`

### `finding_order_records` / `finding_payment_records`

| Column | Type | Notes |
| --- | --- | --- |
| `finding_id` | uuid | |
| `order_record_id` / `payment_record_id` | uuid | |
| `user_id` / `import_batch_id` | uuid | Same ownership as finding and source row |

Composite FKs ensure finding and source row share the same `(import_batch_id, user_id)`.

## RPC contracts

### `public.create_import_batch(...)`

Arguments:

| Arg | Type | Meaning |
| --- | --- | --- |
| `p_idempotency_key` | text | Client idempotency key |
| `p_orders_filename` | text | |
| `p_payments_filename` | text | |
| `p_orders` | jsonb | Array of validated order objects |
| `p_payments` | jsonb | Array of validated payment objects |
| `p_warnings` | jsonb | Array of import-time warning objects (may be `[]`) |

Returns: `uuid` — `import_batches.id`

Order object keys (Stage 4 persistence contract):

`source_row_number`, `original_order_id`, `normalized_order_id`, `original_status`, `normalized_status`, `original_currency`, `normalized_currency`, `original_amount`, `amount_minor`, `original_order_date`, `order_date` (date string `YYYY-MM-DD` or null)

Payment object keys:

`source_row_number`, `original_payment_id`, `normalized_payment_id`, `original_order_reference`, `normalized_order_reference`, `original_type`, `normalized_type`, `original_status`, `normalized_status`, `original_currency`, `normalized_currency`, `original_amount`, `amount_minor`, `original_transaction_date`, `transaction_date`

Warning object keys:

`code`, `severity`, `message`, `currency` (nullable), `financial_impact_minor` (nullable), `sort_key`, optional `order_record_source_rows` / `payment_record_source_rows` as integer arrays of `source_row_number` within this import

Behavior:

1. Require `auth.uid()`; else raise.
2. If `(user_id, idempotency_key)` exists with `status = completed`, return that id (no duplicate).
3. Insert batch as `processing`, insert orders/payments/warnings, set `completed`.
4. Any failure rolls back the entire transaction.
5. Never accept `user_id` from arguments.

Security: `SECURITY DEFINER`, `SET search_path = ''`, revoke from `PUBLIC`/`anon`, grant `authenticated` only.

### `public.replace_current_reconciliation(...)`

Arguments:

| Arg | Type | Meaning |
| --- | --- | --- |
| `p_import_batch_id` | uuid | Owned completed import |
| `p_total_orders` | integer | |
| `p_total_payments` | integer | |
| `p_currency_metrics` | jsonb | Array of per-currency metrics |
| `p_findings` | jsonb | Business findings with lineage |

Metric object: `currency`, `reconciled_value_minor`, `disputed_value_minor`, `money_at_risk_minor`

Finding object: `code`, `severity`, `message`, `currency`, `financial_impact_minor`, `sort_key`, `order_record_ids` (uuid[]), `payment_record_ids` (uuid[])

Behavior:

1. Require `auth.uid()`.
2. Lock/verify import owned, `status = completed`.
3. Delete current reconciliation for import (cascades business findings + metrics + lineage); **do not** delete findings where `reconciliation_id IS NULL`.
4. Insert new reconciliation, metrics, findings, lineage.
5. Reject lineage ids not belonging to this import/user.
6. Failure leaves previous current result intact (single transaction).

Same `SECURITY DEFINER` restrictions as import.

## RLS model

Commit 2: enable + force RLS on every user-owned table; revoke defaults; no policies (deny).

Commit 5: for each table, `SELECT` policy `user_id = (select auth.uid())` for `authenticated`. No direct `INSERT`/`UPDATE`/`DELETE` for `authenticated`/`anon`. Writes only via RPCs.

Indexes on `user_id` and composite ownership columns used by policies and FKs.

## Privilege model

- Tables: revoke all from `PUBLIC`, `anon`, `authenticated`; grant `SELECT` to `authenticated` only (RLS filters rows).
- Functions: execute granted only to `authenticated`.

## Test matrix

| Area | Coverage |
| --- | --- |
| Structure | Tables, columns, PK/FK/UNIQUE/CHECK, indexes, RLS enabled |
| Atomic import | Invalid payload rollback; never completed on failure; idempotent retry |
| Atomic reconcile | Failed replace keeps prior; success leaves one current; preserve warnings |
| Lineage | Cross-import links fail |
| Cascade | Deleting Auth user removes owned application data |
| Two-user | B cannot read/write/replace/delete/forge A’s data; A reads owned; anon sees none; A delete leaves B intact |

## Files

| Path | Role |
| --- | --- |
| `docs/lld/stage-3-database-user-isolation.md` | This design |
| `supabase/schema.sql` | Complete schema + RPCs + RLS |
| `supabase/tests/*.sql` | pgTAP tests |
| `lib/supabase/database.types.ts` | Generated types |
| `lib/supabase/client.ts` / `server.ts` | Typed with `Database` |
| `README.md` / `PLAN.md` | Docs after verification |

## Acceptance criteria

- [ ] Schema applies to a fresh database
- [ ] Constraints, indexes, and RLS verified
- [ ] Atomic import and reconciliation RPCs behave as specified
- [ ] Owner-only RLS and two-user isolation pass
- [ ] Account cascade deletion verified
- [ ] Generated types wired; `test` / `typecheck` / `lint` / `build` pass
- [ ] No `supabase/migrations/`, no service-role key
