CREATE TABLE IF NOT EXISTS public.sync_devices (
  user_id text NOT NULL,
  device_id uuid NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  PRIMARY KEY (user_id, device_id)
);

ALTER TABLE public.learning_notes
  ADD COLUMN IF NOT EXISTS device_id uuid;

ALTER TABLE public.sync_tokens
  ADD COLUMN IF NOT EXISTS device_id uuid;

ALTER TABLE public.learning_notes
  DROP CONSTRAINT IF EXISTS learning_notes_user_id_turn_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS learning_notes_device_turn_idx
  ON public.learning_notes (user_id, device_id, turn_id)
  WHERE device_id IS NOT NULL AND turn_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS learning_notes_user_cursor_idx
  ON public.learning_notes (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS sync_tokens_user_device_idx
  ON public.sync_tokens (user_id, device_id);

ALTER TABLE public.sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_devices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_devices_owner ON public.sync_devices;
CREATE POLICY sync_devices_owner ON public.sync_devices
  USING (user_id = nullif(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), ''));

CREATE OR REPLACE FUNCTION public.resolve_sync_token_identity(candidate_hash text)
RETURNS TABLE(user_id text, device_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tokens.user_id, tokens.device_id
  FROM public.sync_tokens AS tokens
  WHERE tokens.token_hash = candidate_hash
  LIMIT 1
$$;

REVOKE ALL ON public.sync_devices FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_sync_token_identity(text) FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON public.sync_devices TO language_coach_app;
GRANT UPDATE ON public.sync_tokens TO language_coach_app;
GRANT EXECUTE ON FUNCTION public.resolve_sync_token_identity(text) TO language_coach_app;
