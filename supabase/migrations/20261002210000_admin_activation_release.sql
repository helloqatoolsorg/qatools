-- Trusted Next.js admin route only; no browser write permissions.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.license_activations
  ADD COLUMN released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.license_activations.released_by IS
  'Verified admin who released the activation; NULL for historical releases or a deleted admin.';
GRANT UPDATE (status, released_at, released_by) ON public.license_activations TO service_role;
DO $verify$
BEGIN
  IF has_any_column_privilege('anon', 'public.license_activations', 'UPDATE')
    OR has_any_column_privilege('authenticated', 'public.license_activations', 'UPDATE') THEN
    RAISE EXCEPTION 'Browser roles must not be able to change activations';
  END IF;
END;
$verify$;
COMMIT;
