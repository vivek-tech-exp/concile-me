SET search_path TO public, extensions, tests;

BEGIN;
SELECT plan(18);

SELECT tests.create_user(
  '11111111-1111-1111-1111-111111111111',
  'atomic-a@example.com'
);

SELECT tests.authenticate_as('11111111-1111-1111-1111-111111111111');

SELECT lives_ok(
  $$
    SELECT public.create_import_batch(
      'atomic-ok',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(tests.sample_order(1)),
      jsonb_build_array(tests.sample_payment(1)),
      jsonb_build_array(
        jsonb_build_object(
          'code', 'WARN',
          'severity', 'low',
          'message', 'warning',
          'sort_key', 'w1',
          'order_record_source_rows', jsonb_build_array(1)
        )
      )
    )
  $$,
  'valid import succeeds'
);

SELECT is(
  (SELECT status FROM public.import_batches WHERE idempotency_key = 'atomic-ok'),
  'completed',
  'successful import is completed'
);

SELECT is(
  (SELECT orders_row_count FROM public.import_batches WHERE idempotency_key = 'atomic-ok'),
  1,
  'import stores orders_row_count'
);

SELECT is(
  (SELECT payments_row_count FROM public.import_batches WHERE idempotency_key = 'atomic-ok'),
  1,
  'import stores payments_row_count'
);

SELECT is(
  (SELECT warning_count FROM public.import_batches WHERE idempotency_key = 'atomic-ok'),
  1,
  'import stores warning_count'
);

SELECT is(
  public.create_import_batch(
    'atomic-ok',
    'orders.csv',
    'payments.csv',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  ),
  (SELECT id FROM public.import_batches WHERE idempotency_key = 'atomic-ok'),
  'idempotent retry returns existing completed batch'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.import_batches WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'idempotent retry does not duplicate batches'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      'atomic-empty',
      'orders.csv',
      'payments.csv',
      '[]'::jsonb,
      jsonb_build_array(tests.sample_payment(1)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'orders must not be empty',
  'empty orders array is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      'atomic-fail',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        jsonb_build_object(
          'source_row_number', 1,
          'original_order_id', 'x',
          'normalized_order_id', 'x',
          'original_customer_email', 'buyer@example.com',
          'original_status', 'completed',
          'normalized_status', 'completed',
          'original_currency', 'usd',
          'normalized_currency', 'usd',
          'original_gross_amount', '1',
          'gross_amount_minor', 1,
          'original_discount', '0',
          'discount_minor', 0,
          'original_net_amount', '1',
          'net_amount_minor', 1,
          'original_order_date', '2024-01-01 00:00:00',
          'order_timestamp', '2024-01-01 00:00:00'
        )
      ),
      jsonb_build_array(tests.sample_payment(1)),
      '[]'::jsonb
    )
  $$,
  '23514',
  NULL,
  'invalid import payload fails'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.import_batches WHERE idempotency_key = 'atomic-fail'),
  0,
  'failed import does not leave a batch row'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.import_batches WHERE status = 'processing'),
  0,
  'failed imports never become completed or linger as processing'
);

-- Reconciliation replacement
SELECT set_config(
  'tests.batch_id',
  (SELECT id::text FROM public.import_batches WHERE idempotency_key = 'atomic-ok'),
  true
);
SELECT set_config(
  'tests.order_id',
  (
    SELECT id::text
    FROM public.order_records
    WHERE import_batch_id = current_setting('tests.batch_id')::uuid
    LIMIT 1
  ),
  true
);

SELECT lives_ok(
  format(
    $$
      SELECT public.replace_current_reconciliation(
        %L::uuid,
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
            'code', 'MISSING_PAYMENT',
            'severity', 'high',
            'message', 'missing',
            'currency', 'USD',
            'financial_impact_minor', 1000,
            'sort_key', 'b1',
            'order_record_ids', jsonb_build_array(%L),
            'payment_record_ids', '[]'::jsonb
          )
        )
      )
    $$,
    current_setting('tests.batch_id'),
    current_setting('tests.order_id')
  ),
  'first reconciliation replace succeeds'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.findings WHERE category = 'data_quality'),
  1,
  'import-time warnings are preserved after reconciliation'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.reconciliations WHERE import_batch_id = (
    SELECT id FROM public.import_batches WHERE idempotency_key = 'atomic-ok'
  )),
  1,
  'one current reconciliation after success'
);

SELECT throws_ok(
  format(
    $$
      SELECT public.replace_current_reconciliation(
        %L::uuid,
        1,
        1,
        jsonb_build_array(
          jsonb_build_object(
            'currency', 'usd',
            'reconciled_value_minor', 1,
            'disputed_value_minor', 0,
            'money_at_risk_minor', 0
          )
        ),
        '[]'::jsonb
      )
    $$,
    (SELECT id FROM public.import_batches WHERE idempotency_key = 'atomic-ok')
  ),
  '23514',
  NULL,
  'invalid reconciliation payload fails'
);

SELECT is(
  (SELECT reconciled_value_minor FROM public.reconciliation_currency_metrics LIMIT 1),
  1000::bigint,
  'failed replacement retains previous metrics'
);

-- Cross-import lineage rejection setup
SELECT tests.create_user(
  '22222222-2222-2222-2222-222222222222',
  'atomic-b@example.com'
);
SELECT tests.authenticate_as('22222222-2222-2222-2222-222222222222');
SELECT public.create_import_batch(
  'atomic-b',
  'orders.csv',
  'payments.csv',
  jsonb_build_array(tests.sample_order(1)),
  jsonb_build_array(tests.sample_payment(1)),
  '[]'::jsonb
);

SELECT tests.clear_authentication();
SELECT set_config(
  'tests.foreign_order_id',
  (
    SELECT id::text
    FROM public.order_records
    WHERE user_id = '22222222-2222-2222-2222-222222222222'
    LIMIT 1
  ),
  true
);

SELECT tests.authenticate_as('11111111-1111-1111-1111-111111111111');

SELECT throws_ok(
  format(
    $$
      SELECT public.replace_current_reconciliation(
        %L::uuid,
        1,
        1,
        '[]'::jsonb,
        jsonb_build_array(
          jsonb_build_object(
            'code', 'X',
            'severity', 'high',
            'message', 'x',
            'sort_key', 'x',
            'order_record_ids', jsonb_build_array(%L),
            'payment_record_ids', '[]'::jsonb
          )
        )
      )
    $$,
    current_setting('tests.batch_id'),
    current_setting('tests.foreign_order_id')
  ),
  'P0001',
  'Finding order_record_id does not belong to this import',
  'finding lineage cannot cross imports'
);

SELECT tests.clear_authentication();

-- Cascade delete of auth user removes owned data
SELECT tests.create_user(
  '33333333-3333-3333-3333-333333333333',
  'atomic-cascade@example.com'
);
SELECT tests.authenticate_as('33333333-3333-3333-3333-333333333333');
SELECT public.create_import_batch(
  'atomic-cascade',
  'orders.csv',
  'payments.csv',
  jsonb_build_array(tests.sample_order(1)),
  jsonb_build_array(tests.sample_payment(1)),
  '[]'::jsonb
);
SELECT tests.clear_authentication();

DELETE FROM auth.users WHERE id = '33333333-3333-3333-3333-333333333333';

SELECT is(
  (SELECT COUNT(*)::integer FROM public.import_batches WHERE user_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'deleting auth user cascades application data'
);

SELECT * FROM finish();
ROLLBACK;
