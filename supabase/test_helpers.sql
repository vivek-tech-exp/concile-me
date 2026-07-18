-- Shared helpers for Stage 3/4 pgTAP tests (applied via schema_paths on db reset).
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS tests;

CREATE OR REPLACE FUNCTION tests.create_user(p_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    p_id,
    'authenticated',
    'authenticated',
    p_email,
    extensions.crypt('password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION tests.authenticate_as(p_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', p_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION tests.clear_authentication()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION tests.sample_order(p_row integer DEFAULT 1)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'source_row_number', p_row,
    'original_order_id', 'ORD-' || p_row::text,
    'normalized_order_id', 'ORD-' || p_row::text,
    'original_customer_email', 'buyer@example.com',
    'original_status', 'completed',
    'normalized_status', 'completed',
    'original_currency', 'USD',
    'normalized_currency', 'USD',
    'original_gross_amount', '10.00',
    'gross_amount_minor', 1000,
    'original_discount', '0.00',
    'discount_minor', 0,
    'original_net_amount', '10.00',
    'net_amount_minor', 1000,
    'original_order_date', '2024-01-01 00:00:00',
    'order_timestamp', '2024-01-01 00:00:00'
  );
$$;

CREATE OR REPLACE FUNCTION tests.sample_payment(p_row integer DEFAULT 1)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'source_row_number', p_row,
    'original_payment_id', 'PAY-' || p_row::text,
    'normalized_payment_id', 'PAY-' || p_row::text,
    'original_order_reference', 'ORD-' || p_row::text,
    'normalized_order_reference', 'ORD-' || p_row::text,
    'original_type', 'charge',
    'normalized_type', 'charge',
    'original_status', 'settled',
    'normalized_status', 'settled',
    'original_currency', 'USD',
    'normalized_currency', 'USD',
    'original_amount', '10.00',
    'amount_minor', 1000,
    'original_fee', '0.30',
    'fee_minor', 30,
    'original_net_settled', '9.70',
    'net_settled_minor', 970,
    'original_transaction_date', '01/01/2024 00:00',
    'processed_at', '2024-01-01 00:00:00'
  );
$$;

GRANT USAGE ON SCHEMA tests TO postgres, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO postgres, authenticated, service_role;
