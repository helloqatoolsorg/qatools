-- Shared, bounded fixed windows; no credentials, license payloads or raw IPs stored.
CREATE TABLE public.licensing_request_windows (
  scope text NOT NULL,
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  reset_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests > 0),
  PRIMARY KEY (scope, subject_hash)
);
CREATE INDEX licensing_request_windows_expiry ON public.licensing_request_windows(reset_at);
ALTER TABLE public.licensing_request_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.licensing_request_windows FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.consume_licensing_request(p_scope text, p_subject_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_limit integer;
  v_now timestamptz := clock_timestamp();
  v_reset timestamptz;
  v_requests integer;
BEGIN
  v_limit := CASE p_scope
    WHEN 'activate-ip' THEN 60 WHEN 'activate-key' THEN 10
    WHEN 'renew-ip' THEN 120 WHEN 'renew-assignment' THEN 30 ELSE NULL END;
  IF v_limit IS NULL OR p_subject_hash IS NULL OR p_subject_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid licensing limiter input';
  END IF;
  -- Nonblocking cleanup, bounded per request. Idle rows contain only keyed hashes.
  IF pg_try_advisory_xact_lock(728107210) THEN
    DELETE FROM public.licensing_request_windows WHERE (scope, subject_hash) IN (
      SELECT scope, subject_hash FROM public.licensing_request_windows
      WHERE reset_at < v_now - interval '1 day' ORDER BY reset_at LIMIT 200
    );
  END IF;
  INSERT INTO public.licensing_request_windows AS w(scope, subject_hash, reset_at, requests)
    VALUES(p_scope, p_subject_hash, v_now + interval '1 minute', 1)
  ON CONFLICT(scope, subject_hash) DO UPDATE SET
    requests = CASE WHEN w.reset_at <= v_now THEN 1 ELSE least(w.requests + 1, v_limit + 1) END,
    reset_at = CASE WHEN w.reset_at <= v_now THEN v_now + interval '1 minute' ELSE w.reset_at END
  RETURNING reset_at, requests INTO v_reset, v_requests;
  RETURN jsonb_build_object('allowed', v_requests <= v_limit,
    'retryAfter', greatest(1, ceil(extract(epoch FROM v_reset - v_now))::integer));
END;
$$;
REVOKE ALL ON FUNCTION public.consume_licensing_request(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_licensing_request(text,text) TO service_role;
