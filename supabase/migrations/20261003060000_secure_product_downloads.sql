BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public.product_downloads (
  product_id bigint PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  file_path text NOT NULL UNIQUE CHECK (
    length(file_path) BETWEEN 1 AND 512
    AND file_path ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
    AND file_path !~ '(^|/)\.\.?(/|$)' AND file_path !~ '//|/$'
  ),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 128 AND file_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_downloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_downloads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.product_downloads TO service_role;
INSERT INTO storage.buckets(id,name,public) VALUES ('qatools-downloads','qatools-downloads',false)
  ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='qatools-downloads' AND public) THEN
    RAISE EXCEPTION 'qatools-downloads must be a private bucket';
  END IF;
END $$;
-- Restrict browser access even when other existing policies permit broad access.
-- The trusted server issues short-lived download links after ownership checks.
CREATE POLICY qatools_downloads_private ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'qatools-downloads')
  WITH CHECK (bucket_id <> 'qatools-downloads');
COMMIT;
