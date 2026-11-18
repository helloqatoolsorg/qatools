BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.products ADD COLUMN last_release_update_at timestamptz;

CREATE FUNCTION public.track_product_version_release() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.published AND NEW.published AND NEW.current_version IS DISTINCT FROM OLD.current_version THEN
    NEW.last_release_update_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER track_product_version_release BEFORE UPDATE OF current_version ON public.products
FOR EACH ROW EXECUTE FUNCTION public.track_product_version_release();

CREATE FUNCTION public.track_product_download_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.enabled AND NEW.file_path IS DISTINCT FROM OLD.file_path THEN
    UPDATE public.products SET last_release_update_at=clock_timestamp()
    WHERE id=NEW.product_id AND published AND initial_release_date IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER track_product_download_release AFTER UPDATE ON public.product_downloads
FOR EACH ROW EXECUTE FUNCTION public.track_product_download_release();
REVOKE ALL ON FUNCTION public.track_product_version_release(),public.track_product_download_release() FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON COLUMN public.products.last_release_update_at IS 'Published version/download replacement time. Artwork, copy and draft saves do not refresh release badges.';
COMMIT;
