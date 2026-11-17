BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.bundle_releases ADD COLUMN project_manifest jsonb;
ALTER TABLE public.bundle_releases ADD CONSTRAINT project_manifest_object
  CHECK (project_manifest IS NULL OR (jsonb_typeof(project_manifest) = 'object' AND pg_column_size(project_manifest) <= 131072));

CREATE OR REPLACE FUNCTION public.set_assembled_project_download(p_admin_id uuid,p_product_id bigint,p_expected_path text,p_file_path text,p_file_name text,p_sources jsonb,p_project_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source jsonb; selected bigint[]; supplied bigint[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RETURN jsonb_build_object('ok',false); END IF;
 IF p_project_sha256 IS NULL OR p_project_sha256 !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('ok',false); END IF;
 IF jsonb_typeof(p_sources) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sources) NOT BETWEEN 1 AND 100 THEN RETURN jsonb_build_object('ok',false); END IF;
 PERFORM 1 FROM public.products WHERE id=p_product_id AND product_type='project' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
 -- Membership writers also lock the parent product before editing its selection.
 SELECT array_agg(tool_id ORDER BY tool_id) INTO selected FROM public.product_members WHERE product_id=p_product_id;
 SELECT array_agg((x->>'tool_id')::bigint ORDER BY (x->>'tool_id')::bigint) INTO supplied FROM jsonb_array_elements(p_sources) x;
 IF selected IS DISTINCT FROM supplied THEN RETURN jsonb_build_object('ok',false); END IF;
 FOR source IN SELECT value FROM jsonb_array_elements(p_sources) ORDER BY (value->>'tool_id')::bigint LOOP
  PERFORM 1 FROM public.products WHERE id=(source->>'tool_id')::bigint AND product_type='tool' AND published FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  PERFORM 1 FROM public.product_downloads WHERE product_id=(source->>'tool_id')::bigint AND enabled AND file_path=source->>'file_path' FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
 END LOOP;
 INSERT INTO public.bundle_releases(product_id,file_path,tool_ids,project_sha256) VALUES(p_product_id,p_file_path,supplied,p_project_sha256) ON CONFLICT(product_id) DO UPDATE SET file_path=excluded.file_path,tool_ids=excluded.tool_ids,project_sha256=excluded.project_sha256,project_manifest=NULL;
 IF public.set_product_download(p_admin_id,p_product_id,p_expected_path,p_file_path,p_file_name,true)->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Project download changed' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION public.set_prepared_project_download(
  p_admin_id uuid, p_product_id bigint, p_expected_path text, p_file_path text,
  p_file_name text, p_sources jsonb, p_project_sha256 text, p_manifest jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; item public.products;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id = a.user_id
    WHERE a.user_id = p_admin_id AND u.email_confirmed_at IS NOT NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  ) THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT * INTO item FROM public.products WHERE id = p_product_id AND product_type = 'project' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  IF p_manifest IS NOT NULL THEN
    IF jsonb_typeof(p_manifest) IS DISTINCT FROM 'object'
      OR p_manifest->>'schema' IS DISTINCT FROM '1'
      OR p_manifest->>'slug' IS DISTINCT FROM item.slug
      OR jsonb_typeof(p_manifest->'tools') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_manifest->'warnings') IS DISTINCT FROM 'array'
      OR pg_column_size(p_manifest) > 131072
    THEN RETURN jsonb_build_object('ok', false); END IF;
    IF jsonb_array_length(p_manifest->'tools') > 100 OR jsonb_array_length(p_manifest->'warnings') > 200
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(p_manifest->'tools') required(slug)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.product_members m JOIN public.products p ON p.id = m.tool_id
          WHERE m.product_id = item.id AND p.slug = required.slug
        )
      ) THEN RETURN jsonb_build_object('ok', false); END IF;
  END IF;
  result := public.set_assembled_project_download(
    p_admin_id, p_product_id, p_expected_path, p_file_path, p_file_name, p_sources, p_project_sha256
  );
  IF result->>'ok' = 'true' THEN
    UPDATE public.bundle_releases SET project_manifest = p_manifest
      WHERE product_id = p_product_id AND file_path = p_file_path;
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.set_prepared_project_download(uuid,bigint,text,text,text,jsonb,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_prepared_project_download(uuid,bigint,text,text,text,jsonb,text,jsonb) TO service_role;

CREATE FUNCTION public.project_product_details(p_product_id bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'scene', r.project_manifest->>'scene',
    'houdini', r.project_manifest->>'houdini',
    'dependencies', coalesce((
      SELECT jsonb_agg(DISTINCT warning->>'type')
      FROM jsonb_array_elements(r.project_manifest->'warnings') warning
    ), '[]'::jsonb)
  )
  FROM public.products p JOIN public.bundle_releases r ON r.product_id = p.id
    JOIN public.product_downloads d ON d.product_id = p.id AND d.file_path = r.file_path AND d.enabled
  WHERE p.id = p_product_id AND p.product_type = 'project' AND p.published
    AND r.project_manifest IS NOT NULL AND r.project_sha256 IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.project_product_details(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_product_details(bigint) TO anon, authenticated, service_role;
COMMIT;
