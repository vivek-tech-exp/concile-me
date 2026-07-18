SET search_path TO public, extensions, tests;

BEGIN;
SELECT plan(17);

SELECT tests.create_user(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'user-a@example.com'
);
SELECT tests.create_user(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'user-b@example.com'
);

-- User A creates owned data
SELECT tests.authenticate_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT public.create_import_batch(
  'iso-a',
  'orders.csv',
  'payments.csv',
  jsonb_build_array(tests.sample_order(2)),
  jsonb_build_array(tests.sample_payment(2)),
  jsonb_build_array(
    jsonb_build_object(
      'code', 'WARN_A',
      'severity', 'low',
      'message', 'a warning',
      'sort_key', 'a1'
    )
  )
);
SELECT set_config(
  'tests.a_batch',
  (SELECT id::text FROM public.import_batches WHERE idempotency_key = 'iso-a'),
  true
);
SELECT set_config(
  'tests.a_order',
  (
    SELECT id::text
    FROM public.order_records
    WHERE import_batch_id = current_setting('tests.a_batch')::uuid
    LIMIT 1
  ),
  true
);
SELECT public.replace_current_reconciliation(
  current_setting('tests.a_batch')::uuid,
  1,
  1,
  jsonb_build_array(
    jsonb_build_object(
      'currency', 'USD',
      'reconciled_value_minor', 1000,
      'disputed_value_minor', 0,
      'money_at_risk_minor', 0
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'code', 'BIZ_A',
      'severity', 'high',
      'message', 'a finding',
      'currency', 'USD',
      'financial_impact_minor', 100,
      'sort_key', 'biza',
      'order_record_ids', jsonb_build_array(current_setting('tests.a_order')),
      'payment_record_ids', '[]'::jsonb
    )
  )
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.import_batches),
  1,
  'User A can read owned imports'
);
SELECT is(
  (SELECT COUNT(*)::integer FROM public.order_records),
  1,
  'User A can read owned orders'
);
SELECT is(
  (SELECT COUNT(*)::integer FROM public.findings),
  2,
  'User A can read owned findings'
);

-- User B cannot read User A data
SELECT tests.authenticate_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

SELECT is(
  (SELECT COUNT(*)::integer FROM public.import_batches),
  0,
  'User B cannot read User A imports'
);
SELECT is(
  (SELECT COUNT(*)::integer FROM public.order_records),
  0,
  'User B cannot read User A order records'
);
SELECT is(
  (SELECT COUNT(*)::integer FROM public.payment_records),
  0,
  'User B cannot read User A payment records'
);
SELECT is(
  (SELECT COUNT(*)::integer FROM public.reconciliations),
  0,
  'User B cannot read User A reconciliations'
);
SELECT is(
  (SELECT COUNT(*)::integer FROM public.reconciliation_currency_metrics),
  0,
  'User B cannot read User A metrics'
);
SELECT is(
  (SELECT COUNT(*)::integer FROM public.findings),
  0,
  'User B cannot read User A findings'
);
SELECT is(
  (SELECT COUNT(*)::integer FROM public.finding_order_records),
  0,
  'User B cannot read User A finding lineage'
);

SELECT throws_ok(
  format(
    $$
      SELECT public.replace_current_reconciliation(
        %L::uuid,
        1,
        1,
        '[]'::jsonb,
        '[]'::jsonb
      )
    $$,
    current_setting('tests.a_batch')
  ),
  '42501',
  'Import not found',
  'User B cannot replace User A reconciliation'
);

SELECT throws_ok(
  $$
    INSERT INTO public.order_records (
      user_id,
      import_batch_id,
      source_row_number,
      original_order_id,
      normalized_order_id,
      original_status,
      normalized_status,
      original_currency,
      normalized_currency,
      original_gross_amount,
      gross_amount_minor,
      original_net_amount,
      net_amount_minor,
      original_order_date,
      order_timestamp
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      current_setting('tests.a_batch')::uuid,
      99,
      'x',
      'x',
      'completed',
      'completed',
      'USD',
      'USD',
      '1',
      1,
      '1',
      1,
      '2024-01-01 00:00:00',
      '2024-01-01 00:00:00'
    )
  $$,
  '42501',
  NULL,
  'User B cannot create a child under User A import'
);

SELECT throws_ok(
  $$
    UPDATE public.import_batches
    SET user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    WHERE id = current_setting('tests.a_batch')::uuid
  $$,
  '42501',
  NULL,
  'User B cannot modify ownership columns'
);

SELECT throws_ok(
  $$
    DELETE FROM public.import_batches
    WHERE id = current_setting('tests.a_batch')::uuid
  $$,
  '42501',
  NULL,
  'User B cannot delete User A data'
);

-- User B valid operations only affect B
SELECT public.create_import_batch(
  'iso-b',
  'orders.csv',
  'payments.csv',
  jsonb_build_array(tests.sample_order(2)),
  jsonb_build_array(tests.sample_payment(2)),
  '[]'::jsonb
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.import_batches WHERE idempotency_key = 'iso-b'),
  1,
  'User B valid import affects only User B'
);

-- Anonymous has no table privileges / sees nothing
SELECT tests.clear_authentication();
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT count(*) FROM public.import_batches$$,
  '42501',
  NULL,
  'Anonymous requests cannot access application rows'
);

RESET ROLE;

-- Deleting User A leaves User B intact
DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT is(
  (
    SELECT COUNT(*)::integer
    FROM public.import_batches
    WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  1,
  'Deleting User A leaves User B dataset intact'
);

SELECT * FROM finish();
ROLLBACK;
