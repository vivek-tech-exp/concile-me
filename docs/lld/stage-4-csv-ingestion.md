# Stage 4 LLD — CSV Ingestion

## Scope

Import one paired orders/payments CSV batch for an authenticated user: validate files and rows server-side, preserve complete original and normalized source fields, persist atomically via `create_import_batch`, and surface success, warnings, blocking errors, retry, and owned import history on `/app`.

## Exclusions

- Reconciliation matching keys, aggregation, discrepancies, and financial findings (Stage 5+)
- Dashboard metrics, charts, drill-down, and LLM explanations
- Fuzzy matching, automatic column mapping, background jobs
- Migration files; hosted database resets or destructive linked-project operations
- Service-role keys in application code

## Approved decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Parser | PapaParse server-side, `dynamicTyping: false`, comma delimiter, headers on, greedy empty-line skip | Product/AGENTS; strings only for money |
| Money | Exact decimal-string → integer minor units; no `Number`/`parseFloat` | Financial correctness |
| Schema | Extend Stage 3 tables in `supabase/schema.sql` only | Preserve full validated source; no migrations |
| Timestamps | Store original string + parsed `timestamp without time zone` | Source fidelity; calendar validation |
| Blocking vs warning | Header/row validation blocks; email/discount/timestamp/id-normalization warn | Matches Stage 4 plan |
| Persistence | Single `create_import_batch` RPC call after zero blocking issues | Atomicity; no partial completed batches |
| Auth | `getUser()` before reading upload body | Fail closed without parsing untrusted files first when unauthenticated |
| Idempotency | Client UUID key; RPC returns existing completed batch | Safe retries |

## File limits

| Limit | Value |
| --- | --- |
| Files per request | Exactly one orders CSV and one payments CSV |
| Max size per file | 1 MiB (1,048,576 bytes) |
| Max data rows per file | 5,000 |
| Encoding | UTF-8, optional BOM |
| Delimiter | Comma only |
| Empty lines | Ignored |
| Headers | Exact required set; order may vary |
| Duplicate / missing / unexpected headers | Blocking |
| Blocking issues in response | Cap details at 100; track `totalIssueCount` |
| Warning details in response | Cap details at 100; track persisted `warningCount` |
| Request body | Comfortably under Vercel 4.5 MB function-body limit |

## Required headers

Orders (exact set, including spelling and whitespace):

```text
order_id,order_date,customer_email,currency,gross_amount,discount,net_amount,status
```

Payments (exact set, including spelling and whitespace):

```text
transaction_ref,processed_at,order_reference,currency,amount,fee,net_settled,type,status
```

Do not trim or otherwise normalize header names before matching.
Swapped files are detected when each file’s header set matches the other source’s required headers.

## Supported values

| Field | Allowed |
| --- | --- |
| Order `status` | `completed`, `cancelled`, `refunded` (trim + lowercase) |
| Payment `type` | `charge`, `refund` (trim + lowercase) |
| Payment `status` | `settled`, `pending`, `failed` (trim + lowercase) |
| Currency | Any uppercase three-letter code after trim + uppercase |
| Order `order_date` | Exact `YYYY-MM-DD HH:mm:ss`, calendar-valid |
| Payment `processed_at` | Exact `DD/MM/YYYY HH:mm`, calendar-valid when present |

## Money parsing

- Accept non-negative decimal strings with zero, one, or two fractional digits.
- Parse directly into integer minor units (×100).
- Reject commas, exponent notation, signs, excessive precision, malformed values, and unsafe integers (> `Number.MAX_SAFE_INTEGER`).
- Never use `parseFloat`, `Number`, or binary floating-point arithmetic for money.

Optional order `discount`: empty/missing → warning; no minor value stored (`NULL`).

## Ingestion normalization

Lexical only (Stage 5 owns matching semantics):

| Field | Original | Normalized |
| --- | --- | --- |
| Identifiers (`order_id`, `transaction_ref`, `order_reference`) | Exact source string | Trim surrounding whitespace, then uppercase |
| Currency | Exact source string | Trim, uppercase |
| Status / type | Exact source string | Trim, lowercase |

CSV source row number includes the header as row 1; first data record is row 2.

## Non-blocking warnings

| Code (stable) | Condition | Lineage |
| --- | --- | --- |
| `MISSING_OR_INVALID_EMAIL` | Customer email missing or not a valid email shape | Order source row |
| `MISSING_ORDER_DISCOUNT` | Discount field empty/missing | Order source row |
| `MISSING_PAYMENT_TIMESTAMP` | `processed_at` empty/missing | Payment source row |
| `IDENTIFIER_NORMALIZED` | Identifier changed by trim or case normalization | Order or payment source row |

Duplicates, arithmetic differences, status conflicts, and financial meaning are deferred to Stage 5.

Warnings carry source, source row number(s), severity `low`, human message, and deterministic `sort_key`. Sort by `(source, source_row_number, code)` for stable display independent of processing order.

## Schema refinements (before uploads)

### `order_records`

- Rename `original_amount` → `original_net_amount`
- Rename `amount_minor` → `net_amount_minor`
- Add `original_gross_amount` / `gross_amount_minor`
- Add nullable `original_discount` / `discount_minor`
- Add `original_customer_email` (nullable text for empty source)
- Replace `order_date date` with `order_timestamp timestamp without time zone`
- Keep `original_order_date` as the exact source string

### `payment_records`

- Keep `original_payment_id` / `normalized_payment_id` (from `transaction_ref`)
- Add `original_fee` / `fee_minor`
- Add `original_net_settled` / `net_settled_minor`
- Replace `transaction_date date` with nullable `processed_at timestamp without time zone`
- Keep `original_transaction_date` as the exact source string (`processed_at` column in CSV)

### `import_batches`

- Add `orders_row_count`, `payments_row_count`, `warning_count` (non-negative integers)
- Populate inside `create_import_batch`
- Reject empty order or payment arrays

RPC JSON for orders/payments must include all new fields. Hosted Supabase: prepare targeted `ALTER` statements; apply only after explicit approval. Never reset/drop the linked hosted database.

## API — `POST /api/imports`

1. `supabase.auth.getUser()` before reading the body.
2. Require `multipart/form-data`.
3. Validate client idempotency UUID.
4. Extract exactly two files (`orders`, `payments` form fields).
5. Server-side file, CSV, and row validation.
6. On blocking issues: return errors; do not call the database.
7. Call `create_import_batch` once with validated rows and warnings.
8. Return batch ID, counts, warnings.
9. Map DB failures to safe retryable errors (no SQL or source contents).

```ts
type ImportResponse =
  | {
      ok: true;
      batchId: string;
      orderCount: number;
      paymentCount: number;
      warningCount: number;
      warnings: ImportWarning[]; // details capped (MAX_WARNING_DETAILS); use warningCount for total
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        issues?: ImportIssue[];
        totalIssueCount?: number;
        retryable: boolean;
      };
    };
```

## UI — `/app`

Client Component (upload only):

- Labelled orders and payments inputs; expected-file descriptions
- Client size hints (usability only); submit disabled until both files selected
- Importing state; success summary; warning details; blocking error summary
- Retry for network/persistence failures; new idempotency key after success; preserve key on retry
- Rotate the idempotency key when either file changes after an attempt so a lost success response cannot attach new files to the prior batch

Server Component:

- `getUser()`; list RLS-visible completed batches ordered by `created_at DESC`, then `id`
- Filenames, creation time, row counts, warning count, first warnings (per-batch preview; show when truncated)
- Empty, error, and retry states; refresh after successful upload

No reconciliation or dashboard behavior.

## Reference fixture expectations

Supplied `sample/orders.csv` + `sample/payments.csv`:

- 185 order rows, 187 payment rows
- Five ingestion warnings
- No blocking validation errors
- All persisted money values are integers
- Original identifiers preserved; canonical identifiers normalized separately

## Files to create or modify

| Path | Action |
| --- | --- |
| `docs/lld/stage-4-csv-ingestion.md` | This LLD |
| `PLAN.md` | Stage 4 status |
| `supabase/schema.sql` | Source columns + RPC counts |
| `supabase/test_helpers.sql` | Sample payloads |
| `supabase/tests/*.test.sql` | Structure / atomicity / isolation |
| `lib/supabase/database.types.ts` | Regenerated |
| `features/imports/contracts.ts` | Shared types and Zod shapes |
| `features/imports/money.ts` | Exact money parser |
| `features/imports/dates.ts` | Date/timestamp parsers |
| `features/imports/normalize.ts` | Lexical normalization |
| `features/imports/parse-csv.ts` | PapaParse + header validation |
| `features/imports/prepare-import.ts` | Paired file preparation |
| `features/imports/import-form.tsx` | Client upload UI |
| `features/imports/import-list.tsx` | Presentational list pieces as needed |
| `app/api/imports/route.ts` | Authenticated import endpoint |
| `app/(app)/app/page.tsx` | Upload + history |
| `tests/imports/*.test.ts` | Unit and fixture coverage |
| `README.md` | Upload rules (final commit) |

## Verification

```text
npm run test:db
npm run test
npm run typecheck
npm run lint
npm run build
Manual hosted upload acceptance (temporary account; delete after)
```

## Acceptance checklist

- [x] Schema preserves complete validated source records; no migration files
- [x] Exact money/date/normalize parsers covered by unit tests
- [x] Paired CSV validation covers headers, swap, limits, BOM, malformed quotes
- [x] `POST /api/imports` authenticates first; blocks invalid payloads without RPC
- [x] Reference pair: 185 / 187 / 5 warnings / 0 blocking
- [x] Idempotent retry does not duplicate; second user cannot see import (pgTAP)
- [x] UI shows success, warnings, errors, retry, and owned history
- [x] Stage 4 marked COMPLETE only after checks pass

### Hosted acceptance (manual)

Use a temporary authenticated account on the shared hosted project only after the hosted database matches `supabase/schema.sql` (never reset/drop the linked DB):

1. Upload `sample/orders.csv` + `sample/payments.csv`
2. Confirm one completed batch with 185 / 187 / 5 warnings
3. Confirm warnings visible in success UI and history
4. Confirm retry with the same idempotency key does not duplicate
5. Confirm invalid/swapped pair creates no batch
6. Confirm a second user cannot see the import
7. Delete temporary test data after verification
