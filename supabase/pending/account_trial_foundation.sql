-- Trial foundation only. Do not deploy until the versioned licensing batch is complete.
BEGIN;
CREATE TABLE public.account_trials (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 CHECK (ends_at = started_at + interval '168 hours')
);
ALTER TABLE public.account_trials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_trials FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.account_trials TO service_role;
-- Called inside the future trial-capable activation transaction, never during renewal.
CREATE FUNCTION public.start_account_trial(p_activation_id bigint,p_credential_id uuid,p_machine_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account_id uuid; trial public.account_trials%ROWTYPE; started timestamptz;
BEGIN
 SELECT user_id INTO account_id FROM public.account_activations WHERE id=p_activation_id;
 IF account_id IS NULL THEN RETURN NULL; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qatools-activation:' || account_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.account_activations a
 JOIN public.account_activation_credentials c ON c.user_id=a.user_id AND c.id=a.credential_id
 JOIN auth.users u ON u.id=a.user_id
 WHERE a.id=p_activation_id AND a.status='active' AND a.machine_id=p_machine_id
 AND c.id=p_credential_id AND u.email_confirmed_at IS NOT NULL
 AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RETURN NULL; END IF;
 started := clock_timestamp();
 INSERT INTO public.account_trials(user_id,started_at,ends_at)
 VALUES(account_id,started,started+interval '168 hours') ON CONFLICT(user_id) DO NOTHING;
 SELECT * INTO trial FROM public.account_trials WHERE user_id=account_id;
 RETURN jsonb_build_object('startedAt',floor(extract(epoch FROM trial.started_at)),
 'endsAt',floor(extract(epoch FROM trial.ends_at)));
END $$;
REVOKE ALL ON FUNCTION public.start_account_trial(bigint,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
-- No application EXECUTE grant: activation wrapper must call this atomically.
COMMIT;
