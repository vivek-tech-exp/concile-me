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
