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

REVOKE ALL ON FUNCTION public.is_iso_currency(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_safe_js_bigint(bigint) FROM PUBLIC;

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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_batches_status_check
    CHECK (status IN ('processing', 'completed')),
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
  original_status text NOT NULL,
  normalized_status text NOT NULL,
  original_currency text NOT NULL,
  normalized_currency text NOT NULL,
  original_amount text NOT NULL,
  amount_minor bigint NOT NULL,
  original_order_date text NOT NULL,
  order_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_records_source_row_positive
    CHECK (source_row_number > 0),
  CONSTRAINT order_records_currency_check
    CHECK (public.is_iso_currency(normalized_currency)),
  CONSTRAINT order_records_amount_safe_check
    CHECK (public.is_safe_js_bigint(amount_minor)),
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
  original_transaction_date text NOT NULL,
  transaction_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_records_source_row_positive
    CHECK (source_row_number > 0),
  CONSTRAINT payment_records_currency_check
    CHECK (public.is_iso_currency(normalized_currency)),
  CONSTRAINT payment_records_amount_safe_check
    CHECK (public.is_safe_js_bigint(amount_minor)),
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  IF p_orders_filename IS NULL OR length(trim(p_orders_filename)) = 0 THEN
    RAISE EXCEPTION 'orders_filename is required';
  END IF;

  IF p_payments_filename IS NULL OR length(trim(p_payments_filename)) = 0 THEN
    RAISE EXCEPTION 'payments_filename is required';
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

  INSERT INTO public.import_batches (
    user_id,
    status,
    orders_filename,
    payments_filename,
    idempotency_key
  )
  VALUES (
    v_user_id,
    'processing',
    p_orders_filename,
    p_payments_filename,
    p_idempotency_key
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
      original_status,
      normalized_status,
      original_currency,
      normalized_currency,
      original_amount,
      amount_minor,
      original_order_date,
      order_date
    )
    VALUES (
      v_user_id,
      v_batch_id,
      (v_order ->> 'source_row_number')::integer,
      v_order ->> 'original_order_id',
      v_order ->> 'normalized_order_id',
      v_order ->> 'original_status',
      v_order ->> 'normalized_status',
      v_order ->> 'original_currency',
      v_order ->> 'normalized_currency',
      v_order ->> 'original_amount',
      (v_order ->> 'amount_minor')::bigint,
      v_order ->> 'original_order_date',
      NULLIF(v_order ->> 'order_date', '')::date
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
      original_transaction_date,
      transaction_date
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
      v_payment ->> 'original_transaction_date',
      NULLIF(v_payment ->> 'transaction_date', '')::date
    )
    RETURNING id, source_row_number INTO v_payment_id, v_row_number;

    v_payment_ids_by_row :=
      v_payment_ids_by_row || jsonb_build_object(v_row_number::text, v_payment_id);
  END LOOP;

  FOR v_warning IN
    SELECT value
    FROM jsonb_array_elements(p_warnings)
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
      NULLIF(v_warning ->> 'currency', ''),
      NULLIF(v_warning ->> 'financial_impact_minor', '')::bigint,
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
