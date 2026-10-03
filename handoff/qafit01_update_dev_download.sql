-- Link the existing qafit01 test download to the verified warning-fix package.
-- Does not change enabled state or overwrite a different release mapping.
UPDATE public.product_downloads
SET file_path = 'qafit01/dev/7ff94192c4fc38ad552de44f32ec91fc63c572cd67d57b5df6b2b866d7250e30/qatools-houdini22-dev.zip'
WHERE product_id = 1
  AND file_path = 'qafit01/dev/a8c6aafb51f8b06587d36262eb176c91409419eeec2b5e373036701496bb8e1f/qatools-houdini22-dev.zip'
RETURNING product_id, file_name, enabled;
