BEGIN;
SET LOCAL lock_timeout='5s';
-- Validate source snapshots again while holding locks; never select a stale build.
CREATE FUNCTION public.set_assembled_bundle_download(p_admin_id uuid,p_product_id bigint,p_expected_path text,p_file_path text,p_file_name text,p_sources jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source jsonb; selected bigint[]; supplied bigint[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RETURN jsonb_build_object('ok',false); END IF;
 IF jsonb_typeof(p_sources) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sources) NOT BETWEEN 1 AND 100 THEN RETURN jsonb_build_object('ok',false); END IF;
 PERFORM 1 FROM public.products WHERE id=p_product_id AND product_type='bundle' FOR UPDATE;
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
 RETURN public.set_bundle_download(p_admin_id,p_product_id,p_expected_path,p_file_path,p_file_name,supplied);
END $$;
REVOKE ALL ON FUNCTION public.set_assembled_bundle_download(uuid,bigint,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_assembled_bundle_download(uuid,bigint,text,text,text,jsonb) TO service_role;
COMMIT;
