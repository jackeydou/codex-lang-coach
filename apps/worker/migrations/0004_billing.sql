CREATE TABLE IF NOT EXISTS public.billing_customers (
  user_id text PRIMARY KEY,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  stripe_subscription_id text PRIMARY KEY,
  user_id text NOT NULL,
  stripe_customer_id text NOT NULL,
  status text NOT NULL,
  plan text CHECK (plan IN ('monthly', 'quarterly', 'yearly')),
  price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_user_idx
  ON public.billing_subscriptions (user_id, current_period_end DESC);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_customers_owner ON public.billing_customers;
CREATE POLICY billing_customers_owner ON public.billing_customers
  USING (user_id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), ''));

DROP POLICY IF EXISTS billing_subscriptions_owner ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_owner ON public.billing_subscriptions
  USING (user_id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), ''));

-- Stripe webhooks arrive without a user session. This resolves the owning user
-- for a Stripe customer so the Worker can then act inside that user's RLS scope.
CREATE OR REPLACE FUNCTION public.resolve_billing_customer(candidate_customer_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT user_id FROM public.billing_customers WHERE stripe_customer_id = candidate_customer_id LIMIT 1
$$;

REVOKE ALL ON public.billing_customers, public.billing_subscriptions FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_billing_customer(text) FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON public.billing_customers, public.billing_subscriptions TO language_coach_app;
GRANT EXECUTE ON FUNCTION public.resolve_billing_customer(text) TO language_coach_app;
