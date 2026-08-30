CREATE TABLE IF NOT EXISTS public.language_profiles (
  user_id text PRIMARY KEY,
  native_language text NOT NULL DEFAULT 'Chinese',
  target_language text NOT NULL DEFAULT 'English',
  coach_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_notes (
  user_id text NOT NULL,
  id uuid NOT NULL,
  turn_id text,
  input_language text NOT NULL DEFAULT 'other' CHECK (input_language IN ('native', 'target', 'mixed', 'other')),
  original_expression text NOT NULL,
  polished_expression text NOT NULL,
  corrections jsonb NOT NULL DEFAULT '[]'::jsonb,
  patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  native_language text NOT NULL,
  target_language text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, turn_id)
);

CREATE INDEX IF NOT EXISTS learning_notes_user_created_idx
  ON public.learning_notes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.deleted_learning_notes (
  user_id text NOT NULL,
  id uuid NOT NULL,
  deleted_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.sync_tokens (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_tokens_user_idx ON public.sync_tokens (user_id);

ALTER TABLE public.language_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.language_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learning_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_learning_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_learning_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sync_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS language_profiles_owner ON public.language_profiles;
CREATE POLICY language_profiles_owner ON public.language_profiles
  USING (user_id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), ''));

DROP POLICY IF EXISTS learning_notes_owner ON public.learning_notes;
CREATE POLICY learning_notes_owner ON public.learning_notes
  USING (user_id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), ''));

DROP POLICY IF EXISTS deleted_learning_notes_owner ON public.deleted_learning_notes;
CREATE POLICY deleted_learning_notes_owner ON public.deleted_learning_notes
  USING (user_id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), ''));

DROP POLICY IF EXISTS sync_tokens_owner ON public.sync_tokens;
CREATE POLICY sync_tokens_owner ON public.sync_tokens
  USING (user_id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), ''));

CREATE OR REPLACE FUNCTION public.resolve_sync_token(candidate_hash text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT user_id FROM public.sync_tokens WHERE token_hash = candidate_hash LIMIT 1
$$;

REVOKE ALL ON public.language_profiles, public.learning_notes, public.deleted_learning_notes, public.sync_tokens FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_sync_token(text) FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO language_coach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.language_profiles, public.learning_notes, public.deleted_learning_notes TO language_coach_app;
GRANT SELECT, INSERT, DELETE ON public.sync_tokens TO language_coach_app;
GRANT EXECUTE ON FUNCTION public.resolve_sync_token(text) TO language_coach_app;
