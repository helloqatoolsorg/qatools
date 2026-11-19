BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.products,public.product_downloads IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION public.product_release_version(p_number integer) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (p_number/100)::text||'.'||lpad((p_number%100)::text,2,'0');
$$;
CREATE FUNCTION public.initial_product_release_number(p_version text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE parts text[];
BEGIN
 parts:=regexp_match(btrim(p_version),'^[vV]?([1-9][0-9]{0,3})(?:\.([0-9]{1,2}))?$');
 IF parts IS NULL THEN RETURN 100; END IF;
 RETURN parts[1]::integer*100+coalesce(rpad(parts[2],2,'0')::integer,0);
END $$;

CREATE TABLE public.product_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id bigint NOT NULL REFERENCES public.products(id),
 version_number integer NOT NULL CHECK(version_number BETWEEN 100 AND 99999999),
 version text GENERATED ALWAYS AS (public.product_release_version(version_number)) STORED,
 file_path text NOT NULL UNIQUE,
 file_name text NOT NULL,
 compatibility text NOT NULL,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 available boolean NOT NULL DEFAULT true,
 request_id uuid UNIQUE,
 request_fingerprint text CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 prepared_identity jsonb,
 sources jsonb,
 project_manifest jsonb,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 UNIQUE(product_id,version_number)
);
ALTER TABLE public.product_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_releases FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.product_releases TO service_role;

DROP TRIGGER IF EXISTS track_product_version_release ON public.products;
DROP TRIGGER IF EXISTS track_product_download_release ON public.product_downloads;
DROP FUNCTION IF EXISTS public.track_product_version_release();
DROP FUNCTION IF EXISTS public.track_product_download_release();

-- Record only the currently trusted release. Do not invent history from old uploads.
INSERT INTO public.product_releases(product_id,version_number,file_path,file_name,compatibility,published_at,prepared_identity,project_manifest)
 SELECT p.id,public.initial_product_release_number(p.current_version),d.file_path,d.file_name,p.compatibility,
 coalesce(p.initial_release_date,p.release_date,(p.created_at AT TIME ZONE 'UTC')::date)::timestamptz,p.prepared_identity,b.project_manifest
 FROM public.products p JOIN public.product_downloads d ON d.product_id=p.id AND d.enabled
 LEFT JOIN public.bundle_releases b ON b.product_id=p.id
 WHERE p.published OR p.initial_release_date IS NOT NULL;
UPDATE public.products p SET current_version=r.version FROM public.product_releases r WHERE r.product_id=p.id;

CREATE FUNCTION public.guard_product_release_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' OR NOT EXISTS(SELECT 1 FROM public.product_releases WHERE product_id=NEW.id) THEN
  NEW.current_version:='1.00';
 ELSIF current_setting('qatools.publishing_release',true) IS DISTINCT FROM NEW.id::text AND
  (NEW.current_version IS DISTINCT FROM OLD.current_version OR NEW.compatibility IS DISTINCT FROM OLD.compatibility OR
   NEW.prepared_identity IS DISTINCT FROM OLD.prepared_identity OR NEW.last_release_update_at IS DISTINCT FROM OLD.last_release_update_at) THEN
  RAISE EXCEPTION 'Use Publish update to change released files, version or compatibility' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_product_release_fields BEFORE INSERT OR UPDATE ON public.products
 FOR EACH ROW EXECUTE FUNCTION public.guard_product_release_fields();

CREATE FUNCTION public.guard_published_release_download() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target bigint;
BEGIN
 IF TG_OP='UPDATE' AND NEW.product_id IS DISTINCT FROM OLD.product_id AND EXISTS(SELECT 1 FROM public.product_releases WHERE product_id=OLD.product_id) THEN
  RAISE EXCEPTION 'A released download cannot move to another product' USING ERRCODE='22023';
 END IF;
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.product_id ELSE NEW.product_id END;
 IF EXISTS(SELECT 1 FROM public.product_releases WHERE product_id=target) AND
    current_setting('qatools.publishing_release',true) IS DISTINCT FROM target::text THEN
  IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Use Publish update for released downloads' USING ERRCODE='22023'; END IF;
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Use Publish update for released downloads' USING ERRCODE='22023'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER guard_published_release_download BEFORE INSERT OR UPDATE OR DELETE ON public.product_downloads
 FOR EACH ROW EXECUTE FUNCTION public.guard_published_release_download();

CREATE FUNCTION public.capture_first_product_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE download public.product_downloads; previous text;
BEGIN
 IF NEW.published AND NOT EXISTS(SELECT 1 FROM public.product_releases WHERE product_id=NEW.id) THEN
  SELECT * INTO download FROM public.product_downloads WHERE product_id=NEW.id AND enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A stored download is required before publication' USING ERRCODE='22023'; END IF;
  INSERT INTO public.product_releases(product_id,version_number,file_path,file_name,compatibility,prepared_identity,project_manifest)
   VALUES(NEW.id,100,download.file_path,download.file_name,NEW.compatibility,NEW.prepared_identity,
    (SELECT project_manifest FROM public.bundle_releases WHERE product_id=NEW.id));
  previous:=current_setting('qatools.publishing_release',true);
  PERFORM set_config('qatools.publishing_release',NEW.id::text,true);
  UPDATE public.products SET current_version='1.00' WHERE id=NEW.id;
  PERFORM set_config('qatools.publishing_release',coalesce(previous,''),true);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_first_product_release AFTER INSERT OR UPDATE OF published ON public.products
 FOR EACH ROW EXECUTE FUNCTION public.capture_first_product_release();

CREATE FUNCTION public.publish_product_update(p_admin_id uuid,p_product_id bigint,p_expected_release_id uuid,
 p_request_id uuid,p_fingerprint text,p_file_path text,p_file_name text,p_compatibility text,p_notes text,
 p_identity jsonb DEFAULT NULL,p_sources jsonb DEFAULT NULL,p_project_sha256 text DEFAULT NULL,p_manifest jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; download public.product_downloads; prior public.product_releases; existing public.product_releases;
 next_number integer; result jsonb; release public.product_releases; previous text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_notes IS NULL OR length(p_notes)>2000 OR p_compatibility IS NULL OR p_compatibility !~ '^Houdini (2[1-9]|30) and newer$' THEN RAISE EXCEPTION 'Invalid release details' USING ERRCODE='22023'; END IF;
 SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
 IF NOT FOUND OR NOT item.published THEN RAISE EXCEPTION 'Choose a published product' USING ERRCODE='22023'; END IF;
 SELECT * INTO existing FROM public.product_releases WHERE product_id=item.id AND request_id=p_request_id;
 IF FOUND THEN
  IF existing.request_fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'Release request changed' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('ok',true,'id',existing.id,'version',existing.version,'file_path',existing.file_path,'duplicate',true);
 END IF;
 SELECT * INTO download FROM public.product_downloads WHERE product_id=item.id AND enabled FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current download unavailable' USING ERRCODE='40001'; END IF;
 SELECT * INTO prior FROM public.product_releases WHERE product_id=item.id AND file_path=download.file_path AND available FOR SHARE;
 IF NOT FOUND OR prior.id IS DISTINCT FROM p_expected_release_id THEN RAISE EXCEPTION 'Release changed. Reload before publishing' USING ERRCODE='40001'; END IF;
 IF p_file_name IS DISTINCT FROM download.file_name OR p_file_path IS NULL OR
    p_file_path !~ ('^'||item.id::text||'/[0-9a-f-]{36}/') OR
    p_file_path IS DISTINCT FROM item.id::text||'/'||split_part(p_file_path,'/',2)||'/'||p_file_name OR p_file_path=download.file_path THEN
  RAISE EXCEPTION 'Keep the current ZIP filename and use a new upload path' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id AND NOT b.public WHERE o.bucket_id='qatools-downloads' AND o.name=p_file_path;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stored private ZIP unavailable' USING ERRCODE='22023'; END IF;
 IF item.product_type='tool' AND ((p_identity-'sha256') IS DISTINCT FROM (item.prepared_identity-'sha256')) THEN RAISE EXCEPTION 'Tool identity must remain unchanged' USING ERRCODE='22023'; END IF;
 previous:=current_setting('qatools.publishing_release',true);
 PERFORM set_config('qatools.publishing_release',item.id::text,true);
 IF item.product_type='tool' THEN
  IF item.prepared_identity IS NOT NULL THEN
   result:=public.replace_prepared_tool_download(p_admin_id,item.id,download.file_path,p_file_path,p_file_name,p_identity);
  ELSE result:=public.set_product_download(p_admin_id,item.id,download.file_path,p_file_path,p_file_name,true); END IF;
 ELSIF item.product_type='bundle' THEN
  result:=public.set_assembled_bundle_download(p_admin_id,item.id,download.file_path,p_file_path,p_file_name,p_sources);
 ELSE
  result:=public.set_prepared_project_download(p_admin_id,item.id,download.file_path,p_file_path,p_file_name,p_sources,p_project_sha256,p_manifest);
 END IF;
 IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Release inputs changed. Reload before publishing' USING ERRCODE='40001'; END IF;
 SELECT max(version_number)+1 INTO next_number FROM public.product_releases WHERE product_id=item.id;
 INSERT INTO public.product_releases(product_id,version_number,file_path,file_name,compatibility,notes,request_id,request_fingerprint,prepared_identity,sources,project_manifest,created_by)
  VALUES(item.id,next_number,p_file_path,p_file_name,p_compatibility,p_notes,p_request_id,p_fingerprint,p_identity,p_sources,p_manifest,p_admin_id) RETURNING * INTO release;
 UPDATE public.products SET current_version=release.version,compatibility=release.compatibility,last_release_update_at=release.published_at,updated_at=clock_timestamp() WHERE id=item.id;
 PERFORM set_config('qatools.publishing_release',coalesce(previous,''),true);
 RETURN jsonb_build_object('ok',true,'id',release.id,'version',release.version,'file_path',release.file_path,'duplicate',false);
END $$;

CREATE FUNCTION public.set_product_release_available(p_admin_id uuid,p_release_id uuid,p_available boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE release public.product_releases;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RETURN false; END IF;
 SELECT * INTO release FROM public.product_releases WHERE id=p_release_id;
 IF NOT FOUND OR p_available IS NULL THEN RETURN false; END IF;
 PERFORM 1 FROM public.products WHERE id=release.product_id FOR UPDATE;
 IF NOT p_available AND EXISTS(SELECT 1 FROM public.product_downloads WHERE product_id=release.product_id AND file_path=release.file_path AND enabled) THEN RETURN false; END IF;
 UPDATE public.product_releases SET available=p_available WHERE id=release.id;
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.product_release_version(integer),public.initial_product_release_number(text),public.guard_product_release_fields(),public.guard_published_release_download(),public.capture_first_product_release() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.publish_product_update(uuid,bigint,uuid,uuid,text,text,text,text,text,jsonb,jsonb,text,jsonb),public.set_product_release_available(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_product_update(uuid,bigint,uuid,uuid,text,text,text,text,text,jsonb,jsonb,text,jsonb),public.set_product_release_available(uuid,uuid,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.record_product_download(p_request_id uuid,p_user_id uuid,p_product_id bigint,p_file_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE acquired_source text;
BEGIN
 IF p_request_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<=now())) THEN RETURN false; END IF;
 SELECT source INTO acquired_source FROM public.entitlements WHERE user_id=p_user_id AND product_id=p_product_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN
  PERFORM 1 FROM public.products WHERE id=p_product_id AND published AND product_type IN ('tool','bundle') FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  acquired_source := 'free'; -- Unpaid download, not a commercial entitlement or trial start.
 END IF;
 PERFORM 1 FROM public.product_releases WHERE product_id=p_product_id AND available AND file_path=p_file_path FOR SHARE;
 IF NOT FOUND THEN
  PERFORM 1 FROM public.product_downloads WHERE product_id=p_product_id AND enabled AND file_path=p_file_path FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
 END IF;
 IF acquired_source='bundle' THEN
  SELECT CASE WHEN bool_or(r.source='purchase') THEN 'purchase' ELSE 'admin' END INTO acquired_source FROM public.entitlement_origins g JOIN public.entitlements r ON r.id=g.root_id WHERE r.user_id=p_user_id AND g.tool_id=p_product_id AND g.status='active';
 END IF;
 INSERT INTO public.product_download_events(id,product_id,source) VALUES(p_request_id,p_product_id,acquired_source)
 ON CONFLICT(id) DO NOTHING;
 IF FOUND THEN
  INSERT INTO public.account_product_downloads AS history(user_id,product_id,last_downloaded_at)
  VALUES(p_user_id,p_product_id,clock_timestamp())
  ON CONFLICT(user_id,product_id) DO UPDATE
    SET last_downloaded_at=greatest(history.last_downloaded_at,excluded.last_downloaded_at);
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_product_download(uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_product_download(uuid,uuid,bigint,text) TO service_role;


COMMIT;
