SET search_path TO public, extensions, tests;

BEGIN;
SELECT plan(42);

SELECT tests.create_user(
  '11111111-1111-1111-1111-111111111111',
  'atomic-a@example.com'
);

SELECT tests.authenticate_as('11111111-1111-1111-1111-111111111111');

SELECT lives_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000001',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_discount', '',
          'discount_minor', NULL
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      jsonb_build_array(
        jsonb_build_object(
          'code', 'MISSING_ORDER_DISCOUNT',
          'severity', 'low',
          'message', 'discount is missing',
          'sort_key', 'orders:000002:MISSING_ORDER_DISCOUNT',
          'order_record_source_rows', jsonb_build_array(2)
        )
      )
    )
  $$,
  'valid import succeeds'
);

SELECT is(
  (SELECT status FROM public.import_batches WHERE idempotency_key = '10000000-0000-4000-8000-000000000001'),
  'completed',
  'successful import is completed'
);

SELECT is(
  (SELECT orders_row_count FROM public.import_batches WHERE idempotency_key = '10000000-0000-4000-8000-000000000001'),
  1,
  'import stores orders_row_count'
);

SELECT is(
  (SELECT payments_row_count FROM public.import_batches WHERE idempotency_key = '10000000-0000-4000-8000-000000000001'),
  1,
  'import stores payments_row_count'
);

SELECT is(
  (SELECT warning_count FROM public.import_batches WHERE idempotency_key = '10000000-0000-4000-8000-000000000001'),
  1,
  'import stores warning_count'
);

SELECT is(
  public.create_import_batch(
    '10000000-0000-4000-8000-000000000001',
    'orders.csv',
    'payments.csv',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  ),
  (SELECT id FROM public.import_batches WHERE idempotency_key = '10000000-0000-4000-8000-000000000001'),
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
      '10000000-0000-4000-8000-000000000002',
      'orders.csv',
      'payments.csv',
      '[]'::jsonb,
      jsonb_build_array(tests.sample_payment(2)),
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
      '10000000-0000-4000-8000-000000000003',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object('source_row_number', 1))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  '23514',
  NULL,
  'source row 1 is rejected as header lineage'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000004',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_status', 'paid',
          'normalized_status', 'paid'
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  '23514',
  NULL,
  'unsupported order status is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000005',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_net_amount', '-1.00',
          'net_amount_minor', -100
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'order net_amount_minor does not match original_net_amount',
  'negative money is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000006',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(tests.sample_order(2)),
      jsonb_build_array(
        (tests.sample_payment(2) || jsonb_build_object(
          'original_type', 'capture',
          'normalized_type', 'capture'
        ))
      ),
      '[]'::jsonb
    )
  $$,
  '23514',
  NULL,
  'unsupported payment type is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000011',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_currency', 'EUR',
          'normalized_currency', 'USD'
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'order normalized_currency does not match original_currency',
  'forged currency pair is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000012',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_gross_amount', '10.00',
          'gross_amount_minor', 9999,
          'original_net_amount', '10.00',
          'net_amount_minor', 9999
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'order gross_amount_minor does not match original_gross_amount',
  'forged money minor units are rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000013',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_order_id', 'ord-1',
          'normalized_order_id', 'FORGED-ID'
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'order normalized_order_id does not match original_order_id',
  'forged identifier normalization is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000014',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_order_date', '2024-01-01 00:00:00',
          'order_timestamp', '2025-12-31 23:59:59'
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'order order_timestamp does not match original_order_date',
  'forged order timestamp is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      'not-a-uuid',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(tests.sample_order(2)),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'idempotency_key must be a UUID',
  'non-UUID idempotency key is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000015',
      '../orders.csv',
      'payments.csv',
      jsonb_build_array(tests.sample_order(2)),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'orders_filename is invalid',
  'path-like orders filename is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000016',
      'orders.csv',
      'payments.csv',
      (SELECT COALESCE(jsonb_agg('{}'::jsonb), '[]'::jsonb) FROM generate_series(1, 5001)),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'orders exceed the 5000 row limit',
  'orders over 5000 rows are rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000017',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_discount', 'not-money',
          'discount_minor', NULL
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'order original_discount is invalid',
  'malformed non-empty discount with null minor is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000018',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_order_id', '   ',
          'normalized_order_id', ''
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'order original_order_id is required',
  'blank order id is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000019',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(tests.sample_order(2)),
      jsonb_build_array(
        (tests.sample_payment(2) || jsonb_build_object(
          'original_payment_id', '',
          'normalized_payment_id', ''
        ))
      ),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'payment original_payment_id is required',
  'blank payment id is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000020',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(tests.sample_order(2)),
      jsonb_build_array(
        (tests.sample_payment(2) || jsonb_build_object(
          'original_order_reference', ' ',
          'normalized_order_reference', ''
        ))
      ),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'payment original_order_reference is required',
  'blank payment order reference is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000021',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_discount', '',
          'discount_minor', NULL
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      jsonb_build_array(
        jsonb_build_object(
          'code', 'ARBITRARY',
          'severity', 'low',
          'message', 'nope',
          'sort_key', 'orders:000002:ARBITRARY',
          'order_record_source_rows', jsonb_build_array(2)
        )
      )
    )
  $$,
  'P0001',
  'unsupported import warning code',
  'arbitrary warning codes are rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000022',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_discount', '',
          'discount_minor', NULL
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      jsonb_build_array(
        jsonb_build_object(
          'code', 'MISSING_ORDER_DISCOUNT',
          'severity', 'high',
          'message', 'discount is missing',
          'sort_key', 'orders:000002:MISSING_ORDER_DISCOUNT',
          'order_record_source_rows', jsonb_build_array(2)
        )
      )
    )
  $$,
  'P0001',
  'import warning severity must be low',
  'arbitrary warning severities are rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000023',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_discount', '',
          'discount_minor', NULL
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      jsonb_build_array(
        jsonb_build_object(
          'code', 'MISSING_OR_INVALID_EMAIL',
          'severity', 'low',
          'message', 'customer_email is missing or invalid',
          'sort_key', 'orders:000002:MISSING_OR_INVALID_EMAIL',
          'order_record_source_rows', jsonb_build_array(2)
        )
      )
    )
  $,
  'P0001',
  'import warnings do not match the canonical set',
  'warning for a condition that is not present is rejected'
);


SELECT throws_ok(
  $
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000028',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(tests.sample_order(2)),
      jsonb_build_array(tests.sample_payment(2)),
      jsonb_build_array(
        jsonb_build_object(
          'code', 'MISSING_ORDER_DISCOUNT',
          'severity', 'low',
          'message', 'discount is missing',
          'sort_key', 'orders:000002:MISSING_ORDER_DISCOUNT',
          'order_record_source_rows', jsonb_build_array(2)
        )
      )
    )
  $,
  'P0001',
  'import warning count exceeds the canonical set',
  'warning payloads above the canonical count are rejected before iteration'
);

SELECT throws_ok(
  $
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000024',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_discount', '',
          'discount_minor', NULL
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      '[]'::jsonb
    )
  $$,
  'P0001',
  'import warnings do not match the canonical set',
  'omitting a required warning is rejected'
);

SELECT throws_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000025',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_discount', '',
          'discount_minor', NULL
        ))
      ),
      jsonb_build_array(tests.sample_payment(2)),
      jsonb_build_array(
        jsonb_build_object(
          'code', 'MISSING_ORDER_DISCOUNT',
          'severity', 'low',
          'message', 'discount is missing',
          'sort_key', 'orders:000002:MISSING_ORDER_DISCOUNT',
          'payment_record_source_rows', jsonb_build_array(2)
        )
      )
    )
  $$,
  'P0001',
  'import warning lineage is invalid',
  'cross-source warning lineage is rejected'
);

SELECT lives_ok(
  $$
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000026',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_order_id', 'ord-2',
          'normalized_order_id', 'ORD-2',
          'original_customer_email', 'not-an-email',
          'original_discount', '',
          'discount_minor', NULL
        ))
      ),
      jsonb_build_array(
        (tests.sample_payment(2) || jsonb_build_object(
          'original_order_reference', 'ORD-2',
          'normalized_order_reference', 'ORD-2',
          'original_transaction_date', '',
          'processed_at', NULL
        ))
      ),
      jsonb_build_array(
        jsonb_build_object(
          'code', 'IDENTIFIER_NORMALIZED',
          'severity', 'low',
          'message', 'order_id normalized from "ord-2" to "ORD-2"',
          'sort_key', 'orders:000002:IDENTIFIER_NORMALIZED:order_id',
          'order_record_source_rows', jsonb_build_array(2)
        ),
        jsonb_build_object(
          'code', 'MISSING_OR_INVALID_EMAIL',
          'severity', 'low',
          'message', 'customer_email is missing or invalid',
          'sort_key', 'orders:000002:MISSING_OR_INVALID_EMAIL',
          'order_record_source_rows', jsonb_build_array(2)
        ),
        jsonb_build_object(
          'code', 'MISSING_ORDER_DISCOUNT',
          'severity', 'low',
          'message', 'discount is missing',
          'sort_key', 'orders:000002:MISSING_ORDER_DISCOUNT',
          'order_record_source_rows', jsonb_build_array(2)
        ),
        jsonb_build_object(
          'code', 'MISSING_PAYMENT_TIMESTAMP',
          'severity', 'low',
          'message', 'processed_at is missing',
          'sort_key', 'payments:000002:MISSING_PAYMENT_TIMESTAMP',
          'payment_record_source_rows', jsonb_build_array(2)
        )
      )
    )
  $$,
  'documented valid warning set succeeds'
);

SELECT is(
  (SELECT warning_count FROM public.import_batches WHERE idempotency_key = '10000000-0000-4000-8000-000000000026'),
  4,
  'canonical warning set stores the correct warning_count'
);


SELECT lives_ok(
  $
    SELECT public.create_import_batch(
      '10000000-0000-4000-8000-000000000027',
      'orders.csv',
      'payments.csv',
      jsonb_build_array(
        (tests.sample_order(2) || jsonb_build_object(
          'original_order_id', E'\tord-27\t',
          'normalized_order_id', 'ORD-27',
          'original_customer_email', E'\tbuyer@example.com\t',
          'original_status', E'\tcompleted\t',
          'normalized_status', 'completed',
          'original_currency', E'\tUSD\t',
          'normalized_currency', 'USD',
          'original_discount', E'\t',
          'discount_minor', NULL
        ))
      ),
      jsonb_build_array(
        (tests.sample_payment(2) || jsonb_build_object(
          'original_payment_id', E'\tpay-27\t',
          'normalized_payment_id', 'PAY-27',
          'original_order_reference', E'\tord-27\t',
          'normalized_order_reference', 'ORD-27',
          'original_type', E'\tcharge\t',
          'normalized_type', 'charge',
          'original_status', E'\tsettled\t',
          'normalized_status', 'settled',
          'original_currency', E'\tUSD\t',
          'normalized_currency', 'USD',
          'original_transaction_date', E'\t',
          'processed_at', NULL
        ))
      ),
      jsonb_build_array(
        jsonb_build_object(
          'code', 'IDENTIFIER_NORMALIZED',
          'severity', 'low',
          'message', E'order_id normalized from "\tord-27\t" to "ORD-27"',
          'sort_key', 'orders:000002:IDENTIFIER_NORMALIZED:order_id',
          'order_record_source_rows', jsonb_build_array(2)
        ),
        jsonb_build_object(
          'code', 'MISSING_ORDER_DISCOUNT',
          'severity', 'low',
          'message', 'discount is missing',
          'sort_key', 'orders:000002:MISSING_ORDER_DISCOUNT',
          'order_record_source_rows', jsonb_build_array(2)
        ),
        jsonb_build_object(
          'code', 'IDENTIFIER_NORMALIZED',
          'severity', 'low',
          'message', E'order_reference normalized from "\tord-27\t" to "ORD-27"',
          'sort_key', 'payments:000002:IDENTIFIER_NORMALIZED:order_reference',
          'payment_record_source_rows', jsonb_build_array(2)
        ),
        jsonb_build_object(
          'code', 'IDENTIFIER_NORMALIZED',
          'severity', 'low',
          'message', E'transaction_ref normalized from "\tpay-27\t" to "PAY-27"',
          'sort_key', 'payments:000002:IDENTIFIER_NORMALIZED:transaction_ref',
          'payment_record_source_rows', jsonb_build_array(2)
        ),
        jsonb_build_object(
          'code', 'MISSING_PAYMENT_TIMESTAMP',
          'severity', 'low',
          'message', 'processed_at is missing',
          'sort_key', 'payments:000002:MISSING_PAYMENT_TIMESTAMP',
          'payment_record_source_rows', jsonb_build_array(2)
        )
      )
    )
  $,
  'RPC trimming matches TypeScript for tab-padded import fields'
);

SELECT is(
  (SELECT warning_count FROM public.import_batches WHERE idempotency_key = '10000000-0000-4000-8000-000000000027'),
  5,
  'tab-padded blank and normalized fields derive the canonical warnings'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.import_batches WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  3,
  'failed warning validation leaves no partial batch or findings'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.import_batches WHERE status = 'processing'),
  0,
  'failed imports never become completed or linger as processing'
);

-- Reconciliation replacement
SELECT set_config(
  'tests.batch_id',
  (SELECT id::text FROM public.import_batches WHERE idempotency_key = '10000000-0000-4000-8000-000000000001'),
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
    SELECT id FROM public.import_batches WHERE idempotency_key = '10000000-0000-4000-8000-000000000001'
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
    (SELECT id FROM public.import_batches WHERE idempotency_key = '10000000-0000-4000-8000-000000000001')
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
  '10000000-0000-4000-8000-000000000007',
  'orders.csv',
  'payments.csv',
  jsonb_build_array(tests.sample_order(2)),
  jsonb_build_array(tests.sample_payment(2)),
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
  '10000000-0000-4000-8000-000000000008',
  'orders.csv',
  'payments.csv',
  jsonb_build_array(tests.sample_order(2)),
  jsonb_build_array(tests.sample_payment(2)),
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
