BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.account_tool_trials(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 product_id bigint NOT NULL REFERENCES public.products(id),
 started_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,product_id),
 CHECK(ends_at=started_at+interval '168 hours')
);
ALTER TABLE public.account_tool_trials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_tool_trials FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.read_tool_trial_license(p_activation_id bigint,p_credential_id uuid,p_machine_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb; trials jsonb;
BEGIN
 base:=public.read_trial_license(p_activation_id,p_credential_id,p_machine_id);
 IF NOT(base->>'ok')::boolean THEN RETURN base; END IF;
 SELECT coalesce(jsonb_object_agg(p.slug,jsonb_build_object('startedAt',floor(extract(epoch FROM t.started_at)),'endsAt',floor(extract(epoch FROM t.ends_at)))),'{}') INTO trials
 FROM public.account_tool_trials t JOIN public.products p ON p.id=t.product_id
 JOIN public.account_activations a ON a.user_id=t.user_id AND a.id=p_activation_id
 WHERE p.product_type='tool' AND p.published AND p.price_eur>0;
 RETURN (base-'trial'-'trialStartedAt'-'trialEndsAt')||jsonb_build_object('toolTrials',trials);
END $$;
CREATE FUNCTION public.start_tool_trial(p_activation_id bigint,p_credential_id uuid,p_machine_id text,p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb; item public.products; account_id uuid; started timestamptz;
BEGIN
 -- This verifies the current assignment/account and serializes this account's licensing operations.
 base:=public.read_trial_license(p_activation_id,p_credential_id,p_machine_id);
 IF NOT(base->>'ok')::boolean THEN RETURN base; END IF;
 SELECT * INTO item FROM public.products WHERE slug=p_slug AND product_type='tool' AND published FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','tool_unavailable'); END IF;
 SELECT user_id INTO account_id FROM public.account_activations WHERE id=p_activation_id;
 IF item.price_eur>0 AND NOT EXISTS(SELECT 1 FROM public.entitlements WHERE user_id=account_id AND product_id=item.id AND status='active') THEN
  started:=clock_timestamp();
  INSERT INTO public.account_tool_trials(user_id,product_id,started_at,ends_at) VALUES(account_id,item.id,started,started+interval '168 hours') ON CONFLICT(user_id,product_id) DO NOTHING;
 END IF;
 RETURN public.read_tool_trial_license(p_activation_id,p_credential_id,p_machine_id);
END $$;
REVOKE ALL ON FUNCTION public.read_tool_trial_license(bigint,uuid,text),public.start_tool_trial(bigint,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_tool_trial_license(bigint,uuid,text),public.start_tool_trial(bigint,uuid,text,text) TO service_role;
COMMIT;
