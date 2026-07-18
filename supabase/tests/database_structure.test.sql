SET search_path TO public, extensions, tests;

BEGIN;
SELECT plan(16);

SELECT ok(
  to_regclass('public.import_batches') IS NOT NULL,
  'import_batches exists'
);
SELECT ok(
  to_regclass('public.order_records') IS NOT NULL,
  'order_records exists'
);
SELECT ok(
  to_regclass('public.payment_records') IS NOT NULL,
  'payment_records exists'
);
SELECT ok(
  to_regclass('public.reconciliations') IS NOT NULL,
  'reconciliations exists'
);
SELECT ok(
  to_regclass('public.reconciliation_currency_metrics') IS NOT NULL,
  'reconciliation_currency_metrics exists'
);
SELECT ok(
  to_regclass('public.findings') IS NOT NULL,
  'findings exists'
);
SELECT ok(
  to_regclass('public.finding_order_records') IS NOT NULL,
  'finding_order_records exists'
);
SELECT ok(
  to_regclass('public.finding_payment_records') IS NOT NULL,
  'finding_payment_records exists'
);

SELECT ok(
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'order_records' AND column_name = 'amount_minor')
  = 'bigint',
  'order amounts are bigint'
);

SELECT ok(
  (SELECT COUNT(*) = 8
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relrowsecurity
     AND c.relforcerowsecurity),
  'RLS enabled and forced on every user-owned table'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'import_batches_user_idempotency_key'
  ),
  'idempotency unique constraint exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reconciliations_import_batch_key'
  ),
  'one reconciliation per import constraint exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'order_records_import_user_fkey'
  ),
  'order_records composite ownership FK exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'findings_category_reconciliation_consistency'
  ),
  'finding category/reconciliation consistency check exists'
);

SELECT ok(
  to_regprocedure(
    'public.create_import_batch(text,text,text,jsonb,jsonb,jsonb)'
  ) IS NOT NULL,
  'create_import_batch exists'
);

SELECT ok(
  to_regprocedure(
    'public.replace_current_reconciliation(uuid,integer,integer,jsonb,jsonb)'
  ) IS NOT NULL,
  'replace_current_reconciliation exists'
);

SELECT * FROM finish();
ROLLBACK;
