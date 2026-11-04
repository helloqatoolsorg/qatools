BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.houdini_connections(
 id uuid PRIMARY KEY,
 secret_hash text NOT NULL CHECK(secret_hash ~ '^[a-f0-9]{64}$'),
 machine_id text NOT NULL CHECK(machine_id ~ '^[A-F0-9]{16}$'),
 machine_name text NOT NULL CHECK(length(machine_name) BETWEEN 1 AND 80),
 display_code text NOT NULL CHECK(display_code ~ '^[0-9]{6}$'),
 expires_at timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '5 minutes'),
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 activation_id bigint,credential_id uuid
);
CREATE INDEX houdini_connections_expiry ON public.houdini_connections(expires_at);
ALTER TABLE public.houdini_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.houdini_connections FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.houdini_connection(p_action text,p_id uuid,p_secret_hash text DEFAULT NULL,p_machine_id text DEFAULT NULL,p_machine_name text DEFAULT NULL,p_display_code text DEFAULT NULL,p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.houdini_connections; credential public.account_activation_credentials; result jsonb;
BEGIN
 IF p_action='start' THEN
  DELETE FROM public.houdini_connections WHERE id IN(SELECT id FROM public.houdini_connections WHERE expires_at<clock_timestamp() ORDER BY expires_at LIMIT 100);
  INSERT INTO public.houdini_connections(id,secret_hash,machine_id,machine_name,display_code) VALUES(p_id,p_secret_hash,p_machine_id,p_machine_name,p_display_code) RETURNING * INTO item;
  RETURN jsonb_build_object('ok',true,'expiresAt',item.expires_at);
 END IF;
 SELECT * INTO item FROM public.houdini_connections WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR item.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'code','connection_expired'); END IF;
 IF p_action IN ('inspect','approve') THEN
  IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL AND(banned_until IS NULL OR banned_until<=now())) THEN RETURN jsonb_build_object('ok',false,'code','account_unavailable'); END IF;
  IF item.user_id IS NOT NULL AND item.user_id<>p_user_id THEN RETURN jsonb_build_object('ok',false,'code','connection_unavailable'); END IF;
  IF p_action='approve' THEN UPDATE public.houdini_connections SET user_id=p_user_id WHERE id=p_id; END IF;
  RETURN jsonb_build_object('ok',true,'machineName',item.machine_name,'machineId',item.machine_id,'displayCode',item.display_code,'approved',p_action='approve' OR item.user_id IS NOT NULL);
 END IF;
 IF p_action<>'claim' OR p_secret_hash IS NULL OR item.secret_hash<>p_secret_hash OR item.machine_id IS DISTINCT FROM p_machine_id THEN RETURN jsonb_build_object('ok',false,'code','connection_unavailable'); END IF;
 IF item.user_id IS NULL THEN RETURN jsonb_build_object('ok',true,'pending',true); END IF;
 IF item.activation_id IS NOT NULL THEN RETURN public.read_trial_license(item.activation_id,item.credential_id,item.machine_id); END IF;
 SELECT * INTO credential FROM public.account_activation_credentials WHERE user_id=item.user_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','invalid_credential'); END IF;
 result:=public.activate_trial_machine(credential.secret_hash,item.machine_id);
 IF NOT(result->>'ok')::boolean THEN RETURN result; END IF;
 UPDATE public.houdini_connections SET activation_id=(result->'activation'->>'id')::bigint,credential_id=(result->'activation'->>'credential_id')::uuid WHERE id=p_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.houdini_connection(text,uuid,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.houdini_connection(text,uuid,text,text,text,text,uuid) TO service_role;
COMMIT;
