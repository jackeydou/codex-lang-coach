DROP INDEX IF EXISTS public.learning_notes_device_turn_idx;

CREATE INDEX learning_notes_device_turn_idx
  ON public.learning_notes (user_id, device_id, turn_id)
  WHERE device_id IS NOT NULL AND turn_id IS NOT NULL;
