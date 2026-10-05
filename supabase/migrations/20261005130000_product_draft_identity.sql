BEGIN;
SET LOCAL lock_timeout='5s';
-- Manual imports with explicit IDs do not advance the identity sequence.
-- Never rewind the counter, including IDs consumed by failed transactions.
LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE seq regclass; last_id bigint; highest_id bigint;
BEGIN
  seq:=pg_catalog.pg_get_serial_sequence('public.products','id')::regclass;
  IF seq IS NULL THEN RAISE EXCEPTION 'Product identity sequence missing'; END IF;
  EXECUTE format('SELECT last_value FROM %s',seq) INTO last_id;
  SELECT coalesce(max(id),0) INTO highest_id FROM public.products;
  PERFORM pg_catalog.setval(seq,greatest(last_id,highest_id,1),true);
END $$;
CREATE FUNCTION public.delete_unused_product_draft(p_admin_id uuid,p_product_id bigint,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.products; dependency record; in_use boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=p_admin_id
    AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  -- Share the price setup lock; deletion cannot race an external catalog setup.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-price:'||p_product_id::text,0));
  SELECT * INTO item FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Draft changed' USING ERRCODE='40001';
  END IF;
  IF item.published OR item.initial_release_date IS NOT NULL OR item.release_date IS NOT NULL THEN
    RAISE EXCEPTION 'Previously released products cannot be deleted' USING ERRCODE='22023';
  END IF;
  -- Block every incoming reference except the draft's own artwork, download
  -- mapping and included-tool list. This also protects future commercial tables.
  FOR dependency IN
    SELECT c.conrelid::regclass AS relation,a.attname AS column_name
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    WHERE c.contype='f' AND c.confrelid='public.products'::regclass
      AND c.conrelid NOT IN ('public.product_media'::regclass,'public.product_downloads'::regclass)
      AND NOT(c.conrelid='public.product_members'::regclass AND a.attname='product_id')
  LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',dependency.relation,dependency.column_name)
      INTO in_use USING p_product_id;
    IF in_use THEN RAISE EXCEPTION 'Draft has linked records' USING ERRCODE='22023'; END IF;
  END LOOP;
  DELETE FROM public.product_members WHERE product_id=p_product_id;
  DELETE FROM public.product_downloads WHERE product_id=p_product_id;
  DELETE FROM public.product_media WHERE product_id=p_product_id;
  DELETE FROM public.products WHERE id=p_product_id;
  RETURN jsonb_build_object('id',p_product_id);
END $$;
REVOKE ALL ON FUNCTION public.delete_unused_product_draft(uuid,bigint,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_unused_product_draft(uuid,bigint,timestamptz) TO service_role;
COMMIT;
