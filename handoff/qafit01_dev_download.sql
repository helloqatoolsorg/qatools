-- Run in Supabase SQL Editor; development package only, no existing mapping overwritten.
INSERT INTO public.product_downloads (product_id, file_path, file_name, enabled)
VALUES (
  1,
  'qafit01/dev/7ff94192c4fc38ad552de44f32ec91fc63c572cd67d57b5df6b2b866d7250e30/qatools-houdini22-dev.zip',
  'qatools-houdini22-dev.zip',
  true
)
ON CONFLICT (product_id) DO NOTHING
RETURNING product_id, file_name, enabled;
