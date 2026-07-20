-- Stage 3 core relational schema for Revenue Reconciliation.
-- Apply with: psql / supabase db execute against a fresh database.
-- No migration files; this file is the complete schema source of truth for tables.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_iso_currency(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_value ~ '^[A-Z]{3}$';
$$;

CREATE OR REPLACE FUNCTION public.is_safe_js_bigint(p_value bigint)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_value >= -9007199254740991 AND p_value <= 9007199254740991;
$$;

CREATE OR REPLACE FUNCTION public.is_uuid_text(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
$$;

CREATE OR REPLACE FUNCTION public.trim_import_whitespace(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $
  -- Match ECMAScript String.prototype.trim(), which the TypeScript importer uses.
  SELECT btrim(
    COALESCE(p_value, ''),
    chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32)
      || chr(160) || chr(5760)
      || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196)
      || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201)
      || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287)
      || chr(12288) || chr(65279)
  );
$;

CREATE OR REPLACE FUNCTION public.is_import_filename(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_value IS NOT NULL
    AND length(p_value) BETWEEN 1 AND 255
    AND p_value = public.trim_import_whitespace(p_value)
    AND p_value !~ '[\\/\x00]';
$$;

-- Exact non-negative decimal money → minor units (matches app parseMoneyToMinor).
CREATE OR REPLACE FUNCTION public.parse_money_to_minor(p_raw text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_parts text[];
  v_whole text;
  v_frac text;
  v_minor bigint;
BEGIN
  IF p_raw IS NULL OR p_raw = '' THEN
    RETURN NULL;
  END IF;

  IF p_raw ~ '[+\-eE, ]' THEN
    RETURN NULL;
  END IF;

  v_parts := regexp_match(p_raw, '^(\d+)(?:\.(\d{1,2}))?$');
  IF v_parts IS NULL THEN
    RETURN NULL;
  END IF;

  v_whole := v_parts[1];
  v_frac := rpad(COALESCE(v_parts[2], ''), 2, '0');
  v_minor := (v_whole::bigint * 100) + v_frac::bigint;

  IF v_minor < 0 OR NOT public.is_safe_js_bigint(v_minor) THEN
    RETURN NULL;
  END IF;

  RETURN v_minor;
END;
$$;

CREATE OR REPLACE FUNCTION public.parse_order_timestamp(p_raw text)
RETURNS timestamp without time zone
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_year integer;
  v_month integer;
  v_day integer;
  v_hour integer;
  v_minute integer;
  v_second integer;
BEGIN
  IF p_raw IS NULL OR p_raw !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' THEN
    RETURN NULL;
  END IF;

  v_year := substring(p_raw from 1 for 4)::integer;
  v_month := substring(p_raw from 6 for 2)::integer;
  v_day := substring(p_raw from 9 for 2)::integer;
  v_hour := substring(p_raw from 12 for 2)::integer;
  v_minute := substring(p_raw from 15 for 2)::integer;
  v_second := substring(p_raw from 18 for 2)::integer;

  IF v_month < 1 OR v_month > 12
    OR v_day < 1 OR v_day > 31
    OR v_hour > 23 OR v_minute > 59 OR v_second > 59
  THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN make_timestamp(v_year, v_month, v_day, v_hour, v_minute, v_second);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.parse_payment_timestamp(p_raw text)
RETURNS timestamp without time zone
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_day integer;
  v_month integer;
  v_year integer;
  v_hour integer;
  v_minute integer;
BEGIN
  IF p_raw IS NULL OR p_raw !~ '^\d{2}/\d{2}/\d{4} \d{2}:\d{2}$' THEN
    RETURN NULL;
  END IF;

  v_day := substring(p_raw from 1 for 2)::integer;
  v_month := substring(p_raw from 4 for 2)::integer;
  v_year := substring(p_raw from 7 for 4)::integer;
  v_hour := substring(p_raw from 12 for 2)::integer;
  v_minute := substring(p_raw from 15 for 2)::integer;

  IF v_month < 1 OR v_month > 12
    OR v_day < 1 OR v_day > 31
    OR v_hour > 23 OR v_minute > 59
  THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN make_timestamp(v_year, v_month, v_day, v_hour, v_minute, 0);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_import_order_payload(p_order jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_original_order_id text;
  v_normalized_order_id text;
  v_raw_discount text;
  v_discount_minor bigint;
  v_parsed_discount bigint;
  v_expected_ts timestamp without time zone;
  v_provided_ts timestamp without time zone;
BEGIN
  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'order payload must be an object';
  END IF;

  v_original_order_id := COALESCE(p_order ->> 'original_order_id', '');
  v_normalized_order_id := p_order ->> 'normalized_order_id';
  IF public.trim_import_whitespace(v_original_order_id) = '' THEN
    RAISE EXCEPTION 'order original_order_id is required';
  END IF;

  IF upper(public.trim_import_whitespace(v_original_order_id)) IS DISTINCT FROM v_normalized_order_id THEN
    RAISE EXCEPTION 'order normalized_order_id does not match original_order_id';
  END IF;

  IF public.trim_import_whitespace(COALESCE(v_normalized_order_id, '')) = '' THEN
    RAISE EXCEPTION 'order normalized_order_id is required';
  END IF;

  IF lower(public.trim_import_whitespace(COALESCE(p_order ->> 'original_status', '')))
    IS DISTINCT FROM (p_order ->> 'normalized_status')
  THEN
    RAISE EXCEPTION 'order normalized_status does not match original_status';
  END IF;

  IF upper(public.trim_import_whitespace(COALESCE(p_order ->> 'original_currency', '')))
    IS DISTINCT FROM (p_order ->> 'normalized_currency')
  THEN
    RAISE EXCEPTION 'order normalized_currency does not match original_currency';
  END IF;

  IF public.parse_money_to_minor(p_order ->> 'original_gross_amount')
    IS DISTINCT FROM NULLIF(p_order ->> 'gross_amount_minor', '')::bigint
  THEN
    RAISE EXCEPTION 'order gross_amount_minor does not match original_gross_amount';
  END IF;

  IF public.parse_money_to_minor(p_order ->> 'original_net_amount')
    IS DISTINCT FROM NULLIF(p_order ->> 'net_amount_minor', '')::bigint
  THEN
    RAISE EXCEPTION 'order net_amount_minor does not match original_net_amount';
  END IF;

  v_raw_discount := COALESCE(p_order ->> 'original_discount', '');
  v_discount_minor := NULLIF(p_order ->> 'discount_minor', '')::bigint;
  IF public.trim_import_whitespace(v_raw_discount) = '' THEN
    IF v_discount_minor IS NOT NULL THEN
      RAISE EXCEPTION 'order discount_minor must be null when original_discount is empty';
    END IF;
  ELSE
    v_parsed_discount := public.parse_money_to_minor(v_raw_discount);
    IF v_parsed_discount IS NULL THEN
      RAISE EXCEPTION 'order original_discount is invalid';
    END IF;
    IF v_parsed_discount IS DISTINCT FROM v_discount_minor THEN
      RAISE EXCEPTION 'order discount_minor does not match original_discount';
    END IF;
  END IF;

  v_expected_ts := public.parse_order_timestamp(p_order ->> 'original_order_date');
  IF v_expected_ts IS NULL THEN
    RAISE EXCEPTION 'order original_order_date is invalid';
  END IF;

  BEGIN
    v_provided_ts := (p_order ->> 'order_timestamp')::timestamp without time zone;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'order order_timestamp is invalid';
  END;

  IF v_provided_ts IS DISTINCT FROM v_expected_ts THEN
    RAISE EXCEPTION 'order order_timestamp does not match original_order_date';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_import_payment_payload(p_payment jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_original_payment_id text;
  v_normalized_payment_id text;
  v_original_order_reference text;
  v_normalized_order_reference text;
  v_original_ts text;
  v_expected_ts timestamp without time zone;
  v_provided_ts timestamp without time zone;
BEGIN
  IF p_payment IS NULL OR jsonb_typeof(p_payment) <> 'object' THEN
    RAISE EXCEPTION 'payment payload must be an object';
  END IF;

  v_original_payment_id := COALESCE(p_payment ->> 'original_payment_id', '');
  v_normalized_payment_id := p_payment ->> 'normalized_payment_id';
  IF public.trim_import_whitespace(v_original_payment_id) = '' THEN
    RAISE EXCEPTION 'payment original_payment_id is required';
  END IF;

  IF upper(public.trim_import_whitespace(v_original_payment_id)) IS DISTINCT FROM v_normalized_payment_id THEN
    RAISE EXCEPTION 'payment normalized_payment_id does not match original_payment_id';
  END IF;

  IF public.trim_import_whitespace(COALESCE(v_normalized_payment_id, '')) = '' THEN
    RAISE EXCEPTION 'payment normalized_payment_id is required';
  END IF;

  v_original_order_reference := COALESCE(p_payment ->> 'original_order_reference', '');
  v_normalized_order_reference := p_payment ->> 'normalized_order_reference';
  IF public.trim_import_whitespace(v_original_order_reference) = '' THEN
    RAISE EXCEPTION 'payment original_order_reference is required';
  END IF;

  IF upper(public.trim_import_whitespace(v_original_order_reference))
    IS DISTINCT FROM v_normalized_order_reference
  THEN
    RAISE EXCEPTION 'payment normalized_order_reference does not match original_order_reference';
  END IF;

  IF public.trim_import_whitespace(COALESCE(v_normalized_order_reference, '')) = '' THEN
    RAISE EXCEPTION 'payment normalized_order_reference is required';
  END IF;

  IF lower(public.trim_import_whitespace(COALESCE(p_payment ->> 'original_type', '')))
    IS DISTINCT FROM (p_payment ->> 'normalized_type')
  THEN
    RAISE EXCEPTION 'payment normalized_type does not match original_type';
  END IF;

  IF lower(public.trim_import_whitespace(COALESCE(p_payment ->> 'original_status', '')))
    IS DISTINCT FROM (p_payment ->> 'normalized_status')
  THEN
    RAISE EXCEPTION 'payment normalized_status does not match original_status';
  END IF;

  IF upper(public.trim_import_whitespace(COALESCE(p_payment ->> 'original_currency', '')))
    IS DISTINCT FROM (p_payment ->> 'normalized_currency')
  THEN
    RAISE EXCEPTION 'payment normalized_currency does not match original_currency';
  END IF;

  IF public.parse_money_to_minor(p_payment ->> 'original_amount')
    IS DISTINCT FROM NULLIF(p_payment ->> 'amount_minor', '')::bigint
  THEN
    RAISE EXCEPTION 'payment amount_minor does not match original_amount';
  END IF;

  IF public.parse_money_to_minor(p_payment ->> 'original_fee')
    IS DISTINCT FROM NULLIF(p_payment ->> 'fee_minor', '')::bigint
  THEN
    RAISE EXCEPTION 'payment fee_minor does not match original_fee';
  END IF;

  IF public.parse_money_to_minor(p_payment ->> 'original_net_settled')
    IS DISTINCT FROM NULLIF(p_payment ->> 'net_settled_minor', '')::bigint
  THEN
    RAISE EXCEPTION 'payment net_settled_minor does not match original_net_settled';
  END IF;

  v_original_ts := COALESCE(p_payment ->> 'original_transaction_date', '');
  IF public.trim_import_whitespace(v_original_ts) = '' THEN
    IF NULLIF(p_payment ->> 'processed_at', '') IS NOT NULL THEN
      RAISE EXCEPTION 'payment processed_at must be null when original_transaction_date is empty';
    END IF;
  ELSE
    v_expected_ts := public.parse_payment_timestamp(v_original_ts);
    IF v_expected_ts IS NULL THEN
      RAISE EXCEPTION 'payment original_transaction_date is invalid';
    END IF;

    BEGIN
      v_provided_ts := (p_payment ->> 'processed_at')::timestamp without time zone;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION 'payment processed_at is invalid';
    END;

    IF v_provided_ts IS DISTINCT FROM v_expected_ts THEN
      RAISE EXCEPTION 'payment processed_at does not match original_transaction_date';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_warning_sort_key(
  p_source text,
  p_row integer,
  p_code text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_source || ':' || lpad(p_row::text, 6, '0') || ':' || p_code;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_import_email(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.trim_import_whitespace(COALESCE(p_email, ''))
    ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
$$;

CREATE OR REPLACE FUNCTION public.derive_import_warnings(
  p_orders jsonb,
  p_payments jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  WITH order_rows AS (
    SELECT value AS row_payload
    FROM jsonb_array_elements(p_orders)
  ),
  payment_rows AS (
    SELECT value AS row_payload
    FROM jsonb_array_elements(p_payments)
  ),
  warnings AS (
    SELECT jsonb_build_object(
      'code', 'IDENTIFIER_NORMALIZED',
      'severity', 'low',
      'message',
        format(
          'order_id normalized from "%s" to "%s"',
          row_payload ->> 'original_order_id',
          row_payload ->> 'normalized_order_id'
        ),
      'sort_key',
        public.import_warning_sort_key(
          'orders',
          (row_payload ->> 'source_row_number')::integer,
          'IDENTIFIER_NORMALIZED:order_id'
        ),
      'order_record_source_rows',
        jsonb_build_array((row_payload ->> 'source_row_number')::integer)
    ) AS warning
    FROM order_rows
    WHERE (row_payload ->> 'original_order_id')
      IS DISTINCT FROM (row_payload ->> 'normalized_order_id')

    UNION ALL

    SELECT jsonb_build_object(
      'code', 'MISSING_OR_INVALID_EMAIL',
      'severity', 'low',
      'message', 'customer_email is missing or invalid',
      'sort_key',
        public.import_warning_sort_key(
          'orders',
          (row_payload ->> 'source_row_number')::integer,
          'MISSING_OR_INVALID_EMAIL'
        ),
      'order_record_source_rows',
        jsonb_build_array((row_payload ->> 'source_row_number')::integer)
    )
    FROM order_rows
    WHERE NOT public.is_valid_import_email(row_payload ->> 'original_customer_email')

    UNION ALL

    SELECT jsonb_build_object(
      'code', 'MISSING_ORDER_DISCOUNT',
      'severity', 'low',
      'message', 'discount is missing',
      'sort_key',
        public.import_warning_sort_key(
          'orders',
          (row_payload ->> 'source_row_number')::integer,
          'MISSING_ORDER_DISCOUNT'
        ),
      'order_record_source_rows',
        jsonb_build_array((row_payload ->> 'source_row_number')::integer)
    )
    FROM order_rows
    WHERE public.trim_import_whitespace(row_payload ->> 'original_discount') = ''

    UNION ALL

    SELECT jsonb_build_object(
      'code', 'IDENTIFIER_NORMALIZED',
      'severity', 'low',
      'message',
        format(
          'transaction_ref normalized from "%s" to "%s"',
          row_payload ->> 'original_payment_id',
          row_payload ->> 'normalized_payment_id'
        ),
      'sort_key',
        public.import_warning_sort_key(
          'payments',
          (row_payload ->> 'source_row_number')::integer,
          'IDENTIFIER_NORMALIZED:transaction_ref'
        ),
      'payment_record_source_rows',
        jsonb_build_array((row_payload ->> 'source_row_number')::integer)
    )
    FROM payment_rows
    WHERE (row_payload ->> 'original_payment_id')
      IS DISTINCT FROM (row_payload ->> 'normalized_payment_id')

    UNION ALL

    SELECT jsonb_build_object(
      'code', 'IDENTIFIER_NORMALIZED',
      'severity', 'low',
      'message',
        format(
          'order_reference normalized from "%s" to "%s"',
          row_payload ->> 'original_order_reference',
          row_payload ->> 'normalized_order_reference'
        ),
      'sort_key',
        public.import_warning_sort_key(
          'payments',
          (row_payload ->> 'source_row_number')::integer,
          'IDENTIFIER_NORMALIZED:order_reference'
        ),
      'payment_record_source_rows',
        jsonb_build_array((row_payload ->> 'source_row_number')::integer)
    )
    FROM payment_rows
    WHERE (row_payload ->> 'original_order_reference')
      IS DISTINCT FROM (row_payload ->> 'normalized_order_reference')

    UNION ALL

    SELECT jsonb_build_object(
      'code', 'MISSING_PAYMENT_TIMESTAMP',
      'severity', 'low',
      'message', 'processed_at is missing',
      'sort_key',
        public.import_warning_sort_key(
          'payments',
          (row_payload ->> 'source_row_number')::integer,
          'MISSING_PAYMENT_TIMESTAMP'
        ),
      'payment_record_source_rows',
        jsonb_build_array((row_payload ->> 'source_row_number')::integer)
    )
    FROM payment_rows
    WHERE public.trim_import_whitespace(
      row_payload ->> 'original_transaction_date'
    ) = ''
  )
  SELECT COALESCE(
    jsonb_agg(warning ORDER BY warning ->> 'sort_key'),
    '[]'::jsonb
  )
  FROM warnings;
$$;

CREATE OR REPLACE FUNCTION public.assert_provided_import_warnings(
  p_provided jsonb,
  p_expected jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_warning jsonb;
  v_code text;
  v_order_rows jsonb;
  v_payment_rows jsonb;
  v_lineage_row integer;
  v_canonical jsonb;
BEGIN
  IF p_provided IS NULL OR jsonb_typeof(p_provided) <> 'array' THEN
    RAISE EXCEPTION 'warnings must be a JSON array';
  END IF;

  IF jsonb_array_length(p_provided) > jsonb_array_length(p_expected) THEN
    RAISE EXCEPTION 'import warning count exceeds the canonical set';
  END IF;

  FOR v_warning IN
    SELECT value
    FROM jsonb_array_elements(p_provided)
  LOOP
    IF jsonb_typeof(v_warning) <> 'object' THEN
      RAISE EXCEPTION 'import warning must be an object';
    END IF;

    v_code := v_warning ->> 'code';
    IF v_code IS NULL OR v_code NOT IN (
      'MISSING_OR_INVALID_EMAIL',
      'MISSING_ORDER_DISCOUNT',
      'MISSING_PAYMENT_TIMESTAMP',
      'IDENTIFIER_NORMALIZED'
    ) THEN
      RAISE EXCEPTION 'unsupported import warning code';
    END IF;

    IF (v_warning ->> 'severity') IS DISTINCT FROM 'low' THEN
      RAISE EXCEPTION 'import warning severity must be low';
    END IF;

    IF public.trim_import_whitespace(v_warning ->> 'message') = '' THEN
      RAISE EXCEPTION 'import warning message is required';
    END IF;

    IF public.trim_import_whitespace(v_warning ->> 'sort_key') = '' THEN
      RAISE EXCEPTION 'import warning sort_key is required';
    END IF;

    IF v_warning ? 'currency'
      OR v_warning ? 'financial_impact_minor'
    THEN
      RAISE EXCEPTION 'import warnings must not include financial impact';
    END IF;

    v_order_rows := CASE
      WHEN v_warning ? 'order_record_source_rows' THEN v_warning -> 'order_record_source_rows'
      ELSE NULL
    END;
    v_payment_rows := CASE
      WHEN v_warning ? 'payment_record_source_rows' THEN v_warning -> 'payment_record_source_rows'
      ELSE NULL
    END;

    IF (v_order_rows IS NULL) = (v_payment_rows IS NULL) THEN
      RAISE EXCEPTION 'import warning lineage is invalid';
    END IF;

    IF v_order_rows IS NOT NULL THEN
      IF jsonb_typeof(v_order_rows) <> 'array'
        OR jsonb_array_length(v_order_rows) <> 1
        OR v_code = 'MISSING_PAYMENT_TIMESTAMP'
      THEN
        RAISE EXCEPTION 'import warning lineage is invalid';
      END IF;

      BEGIN
        v_lineage_row := (v_order_rows ->> 0)::integer;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE EXCEPTION 'import warning lineage is invalid';
      END;

      IF v_lineage_row IS NULL THEN
        RAISE EXCEPTION 'import warning lineage is invalid';
      END IF;
    ELSE
      IF jsonb_typeof(v_payment_rows) <> 'array'
        OR jsonb_array_length(v_payment_rows) <> 1
        OR v_code IN ('MISSING_OR_INVALID_EMAIL', 'MISSING_ORDER_DISCOUNT')
      THEN
        RAISE EXCEPTION 'import warning lineage is invalid';
      END IF;

      BEGIN
        v_lineage_row := (v_payment_rows ->> 0)::integer;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE EXCEPTION 'import warning lineage is invalid';
      END;

      IF v_lineage_row IS NULL THEN
        RAISE EXCEPTION 'import warning lineage is invalid';
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(
    jsonb_agg(canonical_warning ORDER BY canonical_warning ->> 'sort_key'),
    '[]'::jsonb
  )
  INTO v_canonical
  FROM (
    SELECT CASE
      WHEN warning ? 'order_record_source_rows' THEN
        jsonb_build_object(
          'code', warning ->> 'code',
          'severity', 'low',
          'message', warning ->> 'message',
          'sort_key', warning ->> 'sort_key',
          'order_record_source_rows',
            jsonb_build_array(
              (warning -> 'order_record_source_rows' ->> 0)::integer
            )
        )
      ELSE
        jsonb_build_object(
          'code', warning ->> 'code',
          'severity', 'low',
          'message', warning ->> 'message',
          'sort_key', warning ->> 'sort_key',
          'payment_record_source_rows',
            jsonb_build_array(
              (warning -> 'payment_record_source_rows' ->> 0)::integer
            )
        )
    END AS canonical_warning
    FROM jsonb_array_elements(p_provided) AS provided(warning)
  ) AS canonical_warnings;

  IF v_canonical IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'import warnings do not match the canonical set';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_iso_currency(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_safe_js_bigint(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_uuid_text(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trim_import_whitespace(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_import_filename(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parse_money_to_minor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parse_order_timestamp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parse_payment_timestamp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_import_order_payload(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_import_payment_payload(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_warning_sort_key(text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_valid_import_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.derive_import_warnings(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_provided_import_warnings(jsonb, jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- import_batches
-- ---------------------------------------------------------------------------

CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL,
  orders_filename text NOT NULL,
  payments_filename text NOT NULL,
  idempotency_key text NOT NULL,
  orders_row_count integer NOT NULL DEFAULT 0,
  payments_row_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_batches_status_check
    CHECK (status IN ('processing', 'completed')),
  CONSTRAINT import_batches_counts_nonnegative
    CHECK (
      orders_row_count >= 0
      AND payments_row_count >= 0
      AND warning_count >= 0
    ),
  CONSTRAINT import_batches_id_user_key UNIQUE (id, user_id),
  CONSTRAINT import_batches_user_idempotency_key UNIQUE (user_id, idempotency_key)
);

CREATE INDEX import_batches_user_id_idx
  ON public.import_batches (user_id);

CREATE INDEX import_batches_user_created_at_idx
  ON public.import_batches (user_id, created_at DESC);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.import_batches FROM PUBLIC;
REVOKE ALL ON TABLE public.import_batches FROM anon;
REVOKE ALL ON TABLE public.import_batches FROM authenticated;

-- ---------------------------------------------------------------------------
-- order_records
-- ---------------------------------------------------------------------------

CREATE TABLE public.order_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  import_batch_id uuid NOT NULL,
  source_row_number integer NOT NULL,
  original_order_id text NOT NULL,
  normalized_order_id text NOT NULL,
  original_customer_email text,
  original_status text NOT NULL,
  normalized_status text NOT NULL,
  original_currency text NOT NULL,
  normalized_currency text NOT NULL,
  original_gross_amount text NOT NULL,
  gross_amount_minor bigint NOT NULL,
  original_discount text,
  discount_minor bigint,
  original_net_amount text NOT NULL,
  net_amount_minor bigint NOT NULL,
  original_order_date text NOT NULL,
  order_timestamp timestamp without time zone NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_records_source_row_data
    CHECK (source_row_number > 1),
  CONSTRAINT order_records_status_check
    CHECK (normalized_status IN ('completed', 'cancelled', 'refunded')),
  CONSTRAINT order_records_currency_check
    CHECK (public.is_iso_currency(normalized_currency)),
  CONSTRAINT order_records_gross_safe_check
    CHECK (public.is_safe_js_bigint(gross_amount_minor)),
  CONSTRAINT order_records_discount_safe_check
    CHECK (
      discount_minor IS NULL
      OR public.is_safe_js_bigint(discount_minor)
    ),
  CONSTRAINT order_records_net_safe_check
    CHECK (public.is_safe_js_bigint(net_amount_minor)),
  CONSTRAINT order_records_amounts_nonnegative
    CHECK (
      gross_amount_minor >= 0
      AND net_amount_minor >= 0
      AND (discount_minor IS NULL OR discount_minor >= 0)
    ),
  CONSTRAINT order_records_import_row_key
    UNIQUE (import_batch_id, source_row_number),
  CONSTRAINT order_records_id_import_user_key
    UNIQUE (id, import_batch_id, user_id),
  CONSTRAINT order_records_import_user_fkey
    FOREIGN KEY (import_batch_id, user_id)
    REFERENCES public.import_batches (id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX order_records_user_id_idx
  ON public.order_records (user_id);

CREATE INDEX order_records_import_batch_id_idx
  ON public.order_records (import_batch_id);

CREATE INDEX order_records_import_normalized_order_id_idx
  ON public.order_records (import_batch_id, normalized_order_id);

ALTER TABLE public.order_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_records FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.order_records FROM PUBLIC;
REVOKE ALL ON TABLE public.order_records FROM anon;
REVOKE ALL ON TABLE public.order_records FROM authenticated;

-- ---------------------------------------------------------------------------
-- payment_records
-- ---------------------------------------------------------------------------

CREATE TABLE public.payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  import_batch_id uuid NOT NULL,
  source_row_number integer NOT NULL,
  original_payment_id text NOT NULL,
  normalized_payment_id text NOT NULL,
  original_order_reference text NOT NULL,
  normalized_order_reference text NOT NULL,
  original_type text NOT NULL,
  normalized_type text NOT NULL,
  original_status text NOT NULL,
  normalized_status text NOT NULL,
  original_currency text NOT NULL,
  normalized_currency text NOT NULL,
  original_amount text NOT NULL,
  amount_minor bigint NOT NULL,
  original_fee text NOT NULL,
  fee_minor bigint NOT NULL,
  original_net_settled text NOT NULL,
  net_settled_minor bigint NOT NULL,
  original_transaction_date text NOT NULL,
  processed_at timestamp without time zone,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_records_source_row_data
    CHECK (source_row_number > 1),
  CONSTRAINT payment_records_type_check
    CHECK (normalized_type IN ('charge', 'refund')),
  CONSTRAINT payment_records_status_check
    CHECK (normalized_status IN ('settled', 'pending', 'failed')),
  CONSTRAINT payment_records_currency_check
    CHECK (public.is_iso_currency(normalized_currency)),
  CONSTRAINT payment_records_amount_safe_check
    CHECK (public.is_safe_js_bigint(amount_minor)),
  CONSTRAINT payment_records_fee_safe_check
    CHECK (public.is_safe_js_bigint(fee_minor)),
  CONSTRAINT payment_records_net_settled_safe_check
    CHECK (public.is_safe_js_bigint(net_settled_minor)),
  CONSTRAINT payment_records_amounts_nonnegative
    CHECK (
      amount_minor >= 0
      AND fee_minor >= 0
      AND net_settled_minor >= 0
    ),
  CONSTRAINT payment_records_import_row_key
    UNIQUE (import_batch_id, source_row_number),
  CONSTRAINT payment_records_id_import_user_key
    UNIQUE (id, import_batch_id, user_id),
  CONSTRAINT payment_records_import_user_fkey
    FOREIGN KEY (import_batch_id, user_id)
    REFERENCES public.import_batches (id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX payment_records_user_id_idx
  ON public.payment_records (user_id);

CREATE INDEX payment_records_import_batch_id_idx
  ON public.payment_records (import_batch_id);

CREATE INDEX payment_records_import_normalized_order_ref_idx
  ON public.payment_records (import_batch_id, normalized_order_reference);

ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_records FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_records FROM anon;
REVOKE ALL ON TABLE public.payment_records FROM authenticated;

-- ---------------------------------------------------------------------------
-- reconciliations
-- ---------------------------------------------------------------------------

CREATE TABLE public.reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  import_batch_id uuid NOT NULL,
  total_orders integer NOT NULL,
  total_payments integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconciliations_counts_nonnegative
    CHECK (total_orders >= 0 AND total_payments >= 0),
  CONSTRAINT reconciliations_import_batch_key
    UNIQUE (import_batch_id),
  CONSTRAINT reconciliations_id_import_user_key
    UNIQUE (id, import_batch_id, user_id),
  CONSTRAINT reconciliations_import_user_fkey
    FOREIGN KEY (import_batch_id, user_id)
    REFERENCES public.import_batches (id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX reconciliations_user_id_idx
  ON public.reconciliations (user_id);

CREATE INDEX reconciliations_import_batch_id_idx
  ON public.reconciliations (import_batch_id);

ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reconciliations FROM PUBLIC;
REVOKE ALL ON TABLE public.reconciliations FROM anon;
REVOKE ALL ON TABLE public.reconciliations FROM authenticated;

-- ---------------------------------------------------------------------------
-- reconciliation_currency_metrics
-- ---------------------------------------------------------------------------

CREATE TABLE public.reconciliation_currency_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  import_batch_id uuid NOT NULL,
  reconciliation_id uuid NOT NULL,
  currency text NOT NULL,
  reconciled_value_minor bigint NOT NULL,
  disputed_value_minor bigint NOT NULL,
  money_at_risk_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_currency_metrics_currency_check
    CHECK (public.is_iso_currency(currency)),
  CONSTRAINT reconciliation_currency_metrics_amounts_safe_check
    CHECK (
      public.is_safe_js_bigint(reconciled_value_minor)
      AND public.is_safe_js_bigint(disputed_value_minor)
      AND public.is_safe_js_bigint(money_at_risk_minor)
    ),
  CONSTRAINT reconciliation_currency_metrics_reconciliation_currency_key
    UNIQUE (reconciliation_id, currency),
  CONSTRAINT reconciliation_currency_metrics_reconciliation_fkey
    FOREIGN KEY (reconciliation_id, import_batch_id, user_id)
    REFERENCES public.reconciliations (id, import_batch_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT reconciliation_currency_metrics_import_user_fkey
    FOREIGN KEY (import_batch_id, user_id)
    REFERENCES public.import_batches (id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX reconciliation_currency_metrics_user_id_idx
  ON public.reconciliation_currency_metrics (user_id);

CREATE INDEX reconciliation_currency_metrics_reconciliation_id_idx
  ON public.reconciliation_currency_metrics (reconciliation_id);

ALTER TABLE public.reconciliation_currency_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_currency_metrics FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reconciliation_currency_metrics FROM PUBLIC;
REVOKE ALL ON TABLE public.reconciliation_currency_metrics FROM anon;
REVOKE ALL ON TABLE public.reconciliation_currency_metrics FROM authenticated;

-- ---------------------------------------------------------------------------
-- findings
-- ---------------------------------------------------------------------------

CREATE TABLE public.findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  import_batch_id uuid NOT NULL,
  reconciliation_id uuid,
  category text NOT NULL,
  code text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  currency text,
  financial_impact_minor bigint,
  sort_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT findings_category_check
    CHECK (category IN ('data_quality', 'business')),
  CONSTRAINT findings_category_reconciliation_consistency
    CHECK (
      (reconciliation_id IS NULL AND category = 'data_quality')
      OR (reconciliation_id IS NOT NULL AND category = 'business')
    ),
  CONSTRAINT findings_currency_check
    CHECK (currency IS NULL OR public.is_iso_currency(currency)),
  CONSTRAINT findings_impact_safe_check
    CHECK (
      financial_impact_minor IS NULL
      OR public.is_safe_js_bigint(financial_impact_minor)
    ),
  CONSTRAINT findings_code_nonempty
    CHECK (length(trim(code)) > 0),
  CONSTRAINT findings_severity_nonempty
    CHECK (length(trim(severity)) > 0),
  CONSTRAINT findings_message_nonempty
    CHECK (length(trim(message)) > 0),
  CONSTRAINT findings_sort_key_nonempty
    CHECK (length(trim(sort_key)) > 0),
  CONSTRAINT findings_id_import_user_key
    UNIQUE (id, import_batch_id, user_id),
  CONSTRAINT findings_import_user_fkey
    FOREIGN KEY (import_batch_id, user_id)
    REFERENCES public.import_batches (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT findings_reconciliation_fkey
    FOREIGN KEY (reconciliation_id, import_batch_id, user_id)
    REFERENCES public.reconciliations (id, import_batch_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX findings_user_id_idx
  ON public.findings (user_id);

CREATE INDEX findings_import_batch_id_idx
  ON public.findings (import_batch_id);

CREATE INDEX findings_reconciliation_id_idx
  ON public.findings (reconciliation_id);

CREATE INDEX findings_import_sort_key_idx
  ON public.findings (import_batch_id, sort_key);

ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.findings FROM PUBLIC;
REVOKE ALL ON TABLE public.findings FROM anon;
REVOKE ALL ON TABLE public.findings FROM authenticated;

-- ---------------------------------------------------------------------------
-- finding_order_records
-- ---------------------------------------------------------------------------

CREATE TABLE public.finding_order_records (
  finding_id uuid NOT NULL,
  order_record_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  import_batch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (finding_id, order_record_id),
  CONSTRAINT finding_order_records_finding_fkey
    FOREIGN KEY (finding_id, import_batch_id, user_id)
    REFERENCES public.findings (id, import_batch_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT finding_order_records_order_fkey
    FOREIGN KEY (order_record_id, import_batch_id, user_id)
    REFERENCES public.order_records (id, import_batch_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX finding_order_records_user_id_idx
  ON public.finding_order_records (user_id);

CREATE INDEX finding_order_records_order_record_id_idx
  ON public.finding_order_records (order_record_id);

ALTER TABLE public.finding_order_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finding_order_records FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.finding_order_records FROM PUBLIC;
REVOKE ALL ON TABLE public.finding_order_records FROM anon;
REVOKE ALL ON TABLE public.finding_order_records FROM authenticated;

-- ---------------------------------------------------------------------------
-- finding_payment_records
-- ---------------------------------------------------------------------------

CREATE TABLE public.finding_payment_records (
  finding_id uuid NOT NULL,
  payment_record_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  import_batch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (finding_id, payment_record_id),
  CONSTRAINT finding_payment_records_finding_fkey
    FOREIGN KEY (finding_id, import_batch_id, user_id)
    REFERENCES public.findings (id, import_batch_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT finding_payment_records_payment_fkey
    FOREIGN KEY (payment_record_id, import_batch_id, user_id)
    REFERENCES public.payment_records (id, import_batch_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX finding_payment_records_user_id_idx
  ON public.finding_payment_records (user_id);

CREATE INDEX finding_payment_records_payment_record_id_idx
  ON public.finding_payment_records (payment_record_id);

ALTER TABLE public.finding_payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finding_payment_records FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.finding_payment_records FROM PUBLIC;
REVOKE ALL ON TABLE public.finding_payment_records FROM anon;
REVOKE ALL ON TABLE public.finding_payment_records FROM authenticated;

-- ---------------------------------------------------------------------------
-- create_import_batch — atomic import persistence
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_import_batch(
  p_idempotency_key text,
  p_orders_filename text,
  p_payments_filename text,
  p_orders jsonb,
  p_payments jsonb,
  p_warnings jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_batch_id uuid;
  v_existing_id uuid;
  v_order jsonb;
  v_payment jsonb;
  v_warning jsonb;
  v_finding_id uuid;
  v_order_id uuid;
  v_payment_id uuid;
  v_row_number integer;
  v_order_ids_by_row jsonb := '{}'::jsonb;
  v_payment_ids_by_row jsonb := '{}'::jsonb;
  v_expected_warnings jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL OR NOT public.is_uuid_text(p_idempotency_key) THEN
    RAISE EXCEPTION 'idempotency_key must be a UUID';
  END IF;

  IF NOT public.is_import_filename(p_orders_filename) THEN
    RAISE EXCEPTION 'orders_filename is invalid';
  END IF;

  IF NOT public.is_import_filename(p_payments_filename) THEN
    RAISE EXCEPTION 'payments_filename is invalid';
  END IF;

  IF p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' THEN
    RAISE EXCEPTION 'orders must be a JSON array';
  END IF;

  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'payments must be a JSON array';
  END IF;

  IF p_warnings IS NULL OR jsonb_typeof(p_warnings) <> 'array' THEN
    RAISE EXCEPTION 'warnings must be a JSON array';
  END IF;

  SELECT ib.id
  INTO v_existing_id
  FROM public.import_batches AS ib
  WHERE ib.user_id = v_user_id
    AND ib.idempotency_key = p_idempotency_key
    AND ib.status = 'completed';

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  IF jsonb_array_length(p_orders) = 0 THEN
    RAISE EXCEPTION 'orders must not be empty';
  END IF;

  IF jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'payments must not be empty';
  END IF;

  IF jsonb_array_length(p_orders) > 5000 THEN
    RAISE EXCEPTION 'orders exceed the 5000 row limit';
  END IF;

  IF jsonb_array_length(p_payments) > 5000 THEN
    RAISE EXCEPTION 'payments exceed the 5000 row limit';
  END IF;

  FOR v_order IN
    SELECT value
    FROM jsonb_array_elements(p_orders)
  LOOP
    PERFORM public.assert_import_order_payload(v_order);
  END LOOP;

  FOR v_payment IN
    SELECT value
    FROM jsonb_array_elements(p_payments)
  LOOP
    PERFORM public.assert_import_payment_payload(v_payment);
  END LOOP;

  v_expected_warnings := public.derive_import_warnings(p_orders, p_payments);
  PERFORM public.assert_provided_import_warnings(p_warnings, v_expected_warnings);

  INSERT INTO public.import_batches (
    user_id,
    status,
    orders_filename,
    payments_filename,
    idempotency_key,
    orders_row_count,
    payments_row_count,
    warning_count
  )
  VALUES (
    v_user_id,
    'processing',
    p_orders_filename,
    p_payments_filename,
    p_idempotency_key,
    jsonb_array_length(p_orders),
    jsonb_array_length(p_payments),
    jsonb_array_length(v_expected_warnings)
  )
  RETURNING id INTO v_batch_id;

  FOR v_order IN
    SELECT value
    FROM jsonb_array_elements(p_orders)
  LOOP
    INSERT INTO public.order_records (
      user_id,
      import_batch_id,
      source_row_number,
      original_order_id,
      normalized_order_id,
      original_customer_email,
      original_status,
      normalized_status,
      original_currency,
      normalized_currency,
      original_gross_amount,
      gross_amount_minor,
      original_discount,
      discount_minor,
      original_net_amount,
      net_amount_minor,
      original_order_date,
      order_timestamp
    )
    VALUES (
      v_user_id,
      v_batch_id,
      (v_order ->> 'source_row_number')::integer,
      v_order ->> 'original_order_id',
      v_order ->> 'normalized_order_id',
      NULLIF(v_order ->> 'original_customer_email', ''),
      v_order ->> 'original_status',
      v_order ->> 'normalized_status',
      v_order ->> 'original_currency',
      v_order ->> 'normalized_currency',
      v_order ->> 'original_gross_amount',
      (v_order ->> 'gross_amount_minor')::bigint,
      NULLIF(v_order ->> 'original_discount', ''),
      NULLIF(v_order ->> 'discount_minor', '')::bigint,
      v_order ->> 'original_net_amount',
      (v_order ->> 'net_amount_minor')::bigint,
      v_order ->> 'original_order_date',
      (v_order ->> 'order_timestamp')::timestamp without time zone
    )
    RETURNING id, source_row_number INTO v_order_id, v_row_number;

    v_order_ids_by_row := v_order_ids_by_row || jsonb_build_object(v_row_number::text, v_order_id);
  END LOOP;

  FOR v_payment IN
    SELECT value
    FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.payment_records (
      user_id,
      import_batch_id,
      source_row_number,
      original_payment_id,
      normalized_payment_id,
      original_order_reference,
      normalized_order_reference,
      original_type,
      normalized_type,
      original_status,
      normalized_status,
      original_currency,
      normalized_currency,
      original_amount,
      amount_minor,
      original_fee,
      fee_minor,
      original_net_settled,
      net_settled_minor,
      original_transaction_date,
      processed_at
    )
    VALUES (
      v_user_id,
      v_batch_id,
      (v_payment ->> 'source_row_number')::integer,
      v_payment ->> 'original_payment_id',
      v_payment ->> 'normalized_payment_id',
      v_payment ->> 'original_order_reference',
      v_payment ->> 'normalized_order_reference',
      v_payment ->> 'original_type',
      v_payment ->> 'normalized_type',
      v_payment ->> 'original_status',
      v_payment ->> 'normalized_status',
      v_payment ->> 'original_currency',
      v_payment ->> 'normalized_currency',
      v_payment ->> 'original_amount',
      (v_payment ->> 'amount_minor')::bigint,
      v_payment ->> 'original_fee',
      (v_payment ->> 'fee_minor')::bigint,
      v_payment ->> 'original_net_settled',
      (v_payment ->> 'net_settled_minor')::bigint,
      v_payment ->> 'original_transaction_date',
      NULLIF(v_payment ->> 'processed_at', '')::timestamp without time zone
    )
    RETURNING id, source_row_number INTO v_payment_id, v_row_number;

    v_payment_ids_by_row :=
      v_payment_ids_by_row || jsonb_build_object(v_row_number::text, v_payment_id);
  END LOOP;

  FOR v_warning IN
    SELECT value
    FROM jsonb_array_elements(v_expected_warnings)
  LOOP
    INSERT INTO public.findings (
      user_id,
      import_batch_id,
      reconciliation_id,
      category,
      code,
      severity,
      message,
      currency,
      financial_impact_minor,
      sort_key
    )
    VALUES (
      v_user_id,
      v_batch_id,
      NULL,
      'data_quality',
      v_warning ->> 'code',
      v_warning ->> 'severity',
      v_warning ->> 'message',
      NULL,
      NULL,
      v_warning ->> 'sort_key'
    )
    RETURNING id INTO v_finding_id;

    IF v_warning ? 'order_record_source_rows'
      AND jsonb_typeof(v_warning -> 'order_record_source_rows') = 'array'
    THEN
      FOR v_row_number IN
        SELECT (value #>> '{}')::integer
        FROM jsonb_array_elements(v_warning -> 'order_record_source_rows')
      LOOP
        v_order_id := (v_order_ids_by_row ->> v_row_number::text)::uuid;
        IF v_order_id IS NULL THEN
          RAISE EXCEPTION 'Warning references unknown order source_row_number %', v_row_number;
        END IF;

        INSERT INTO public.finding_order_records (
          finding_id,
          order_record_id,
          user_id,
          import_batch_id
        )
        VALUES (
          v_finding_id,
          v_order_id,
          v_user_id,
          v_batch_id
        );
      END LOOP;
    END IF;

    IF v_warning ? 'payment_record_source_rows'
      AND jsonb_typeof(v_warning -> 'payment_record_source_rows') = 'array'
    THEN
      FOR v_row_number IN
        SELECT (value #>> '{}')::integer
        FROM jsonb_array_elements(v_warning -> 'payment_record_source_rows')
      LOOP
        v_payment_id := (v_payment_ids_by_row ->> v_row_number::text)::uuid;
        IF v_payment_id IS NULL THEN
          RAISE EXCEPTION 'Warning references unknown payment source_row_number %', v_row_number;
        END IF;

        INSERT INTO public.finding_payment_records (
          finding_id,
          payment_record_id,
          user_id,
          import_batch_id
        )
        VALUES (
          v_finding_id,
          v_payment_id,
          v_user_id,
          v_batch_id
        );
      END LOOP;
    END IF;
  END LOOP;

  UPDATE public.import_batches AS ib
  SET
    status = 'completed',
    updated_at = now()
  WHERE ib.id = v_batch_id
    AND ib.user_id = v_user_id;

  RETURN v_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_import_batch(text, text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_import_batch(text, text, text, jsonb, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_import_batch(text, text, text, jsonb, jsonb, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- replace_current_reconciliation — atomic current-result replacement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_current_reconciliation(
  p_import_batch_id uuid,
  p_total_orders integer,
  p_total_payments integer,
  p_currency_metrics jsonb,
  p_findings jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_import public.import_batches%ROWTYPE;
  v_reconciliation_id uuid;
  v_metric jsonb;
  v_finding jsonb;
  v_finding_id uuid;
  v_order_id uuid;
  v_payment_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_currency_metrics IS NULL OR jsonb_typeof(p_currency_metrics) <> 'array' THEN
    RAISE EXCEPTION 'currency_metrics must be a JSON array';
  END IF;

  IF p_findings IS NULL OR jsonb_typeof(p_findings) <> 'array' THEN
    RAISE EXCEPTION 'findings must be a JSON array';
  END IF;

  SELECT *
  INTO v_import
  FROM public.import_batches AS ib
  WHERE ib.id = p_import_batch_id
    AND ib.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import not found'
      USING ERRCODE = '42501';
  END IF;

  IF v_import.status <> 'completed' THEN
    RAISE EXCEPTION 'Import is not completed';
  END IF;

  -- Deletes current reconciliation and cascaded business findings/metrics/lineage.
  -- Import-time warnings (reconciliation_id IS NULL) are preserved.
  DELETE FROM public.reconciliations AS r
  WHERE r.import_batch_id = p_import_batch_id
    AND r.user_id = v_user_id;

  INSERT INTO public.reconciliations (
    user_id,
    import_batch_id,
    total_orders,
    total_payments
  )
  VALUES (
    v_user_id,
    p_import_batch_id,
    p_total_orders,
    p_total_payments
  )
  RETURNING id INTO v_reconciliation_id;

  FOR v_metric IN
    SELECT value
    FROM jsonb_array_elements(p_currency_metrics)
  LOOP
    INSERT INTO public.reconciliation_currency_metrics (
      user_id,
      import_batch_id,
      reconciliation_id,
      currency,
      reconciled_value_minor,
      disputed_value_minor,
      money_at_risk_minor
    )
    VALUES (
      v_user_id,
      p_import_batch_id,
      v_reconciliation_id,
      v_metric ->> 'currency',
      (v_metric ->> 'reconciled_value_minor')::bigint,
      (v_metric ->> 'disputed_value_minor')::bigint,
      (v_metric ->> 'money_at_risk_minor')::bigint
    );
  END LOOP;

  FOR v_finding IN
    SELECT value
    FROM jsonb_array_elements(p_findings)
  LOOP
    INSERT INTO public.findings (
      user_id,
      import_batch_id,
      reconciliation_id,
      category,
      code,
      severity,
      message,
      currency,
      financial_impact_minor,
      sort_key
    )
    VALUES (
      v_user_id,
      p_import_batch_id,
      v_reconciliation_id,
      'business',
      v_finding ->> 'code',
      v_finding ->> 'severity',
      v_finding ->> 'message',
      NULLIF(v_finding ->> 'currency', ''),
      NULLIF(v_finding ->> 'financial_impact_minor', '')::bigint,
      v_finding ->> 'sort_key'
    )
    RETURNING id INTO v_finding_id;

    IF v_finding ? 'order_record_ids'
      AND jsonb_typeof(v_finding -> 'order_record_ids') = 'array'
    THEN
      FOR v_order_id IN
        SELECT (value #>> '{}')::uuid
        FROM jsonb_array_elements(v_finding -> 'order_record_ids')
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM public.order_records AS o
          WHERE o.id = v_order_id
            AND o.import_batch_id = p_import_batch_id
            AND o.user_id = v_user_id
        ) THEN
          RAISE EXCEPTION 'Finding order_record_id does not belong to this import';
        END IF;

        INSERT INTO public.finding_order_records (
          finding_id,
          order_record_id,
          user_id,
          import_batch_id
        )
        VALUES (
          v_finding_id,
          v_order_id,
          v_user_id,
          p_import_batch_id
        );
      END LOOP;
    END IF;

    IF v_finding ? 'payment_record_ids'
      AND jsonb_typeof(v_finding -> 'payment_record_ids') = 'array'
    THEN
      FOR v_payment_id IN
        SELECT (value #>> '{}')::uuid
        FROM jsonb_array_elements(v_finding -> 'payment_record_ids')
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM public.payment_records AS p
          WHERE p.id = v_payment_id
            AND p.import_batch_id = p_import_batch_id
            AND p.user_id = v_user_id
        ) THEN
          RAISE EXCEPTION 'Finding payment_record_id does not belong to this import';
        END IF;

        INSERT INTO public.finding_payment_records (
          finding_id,
          payment_record_id,
          user_id,
          import_batch_id
        )
        VALUES (
          v_finding_id,
          v_payment_id,
          v_user_id,
          p_import_batch_id
        );
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_reconciliation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_current_reconciliation(uuid, integer, integer, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_current_reconciliation(uuid, integer, integer, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_current_reconciliation(uuid, integer, integer, jsonb, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Owner-only RLS policies and SELECT grants
-- Direct INSERT/UPDATE/DELETE remain revoked; writes go through RPCs.
-- ---------------------------------------------------------------------------

GRANT SELECT ON TABLE public.import_batches TO authenticated;
GRANT SELECT ON TABLE public.order_records TO authenticated;
GRANT SELECT ON TABLE public.payment_records TO authenticated;
GRANT SELECT ON TABLE public.reconciliations TO authenticated;
GRANT SELECT ON TABLE public.reconciliation_currency_metrics TO authenticated;
GRANT SELECT ON TABLE public.findings TO authenticated;
GRANT SELECT ON TABLE public.finding_order_records TO authenticated;
GRANT SELECT ON TABLE public.finding_payment_records TO authenticated;

CREATE POLICY import_batches_select_own
  ON public.import_batches
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY order_records_select_own
  ON public.order_records
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY payment_records_select_own
  ON public.payment_records
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY reconciliations_select_own
  ON public.reconciliations
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY reconciliation_currency_metrics_select_own
  ON public.reconciliation_currency_metrics
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY findings_select_own
  ON public.findings
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY finding_order_records_select_own
  ON public.finding_order_records
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY finding_payment_records_select_own
  ON public.finding_payment_records
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
