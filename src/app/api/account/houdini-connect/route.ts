import {requireAccount} from "@/lib/requireAccount";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {connectionDatabase,validConnectionId} from "@/lib/houdiniConnection";
import {privateJson,readActivationBody,activationFailure} from "@/lib/activationHttp";
import {licensingRequestLimit} from "@/lib/licensingRequestLimit";
import {createActivationKey} from "@/lib/activationCredentials";
import {encryptActivationKey} from "@/lib/activationKeyEncryption";
export const runtime="nodejs";
export async function GET(request:Request){return handle(request,false);}
export async function POST(request:Request){return handle(request,true);}
async function handle(request:Request,approve:boolean){
 try{
  const auth=await requireAccount(request,"connect Houdini");if(auth.response)return auth.response;
  const limited=await licensingRequestLimit("activate-key","browser-approval:"+auth.user.id);if(limited)return limited;
  const id=approve?(await readActivationBody(request))?.id:new URL(request.url).searchParams.get("id");
  if(!validConnectionId(id))return privateJson({error:"Invalid connection link. Start again in Houdini."},400);
  const inspected=await connectionDatabase.rpc("houdini_connection",{p_action:"inspect",p_id:id,p_user_id:auth.user.id});
  if(inspected.error)return activationFailure();
  if(!inspected.data?.ok)return privateJson({error:"Connection expired or unavailable. Start again in Houdini."},410);
  if(!approve)return privateJson({connection:inspected.data});
  const credential=await supabaseAdmin.from("account_activation_credentials").select("id").eq("user_id",auth.user.id).maybeSingle();
  if(credential.error)return activationFailure();
  if(!credential.data){
   const generated=createActivationKey(),encrypted=encryptActivationKey(generated.key,auth.user.id);
   const created=await supabaseAdmin.rpc("set_account_activation_credential",{p_user_id:auth.user.id,p_secret_hash:generated.hash,p_key_prefix:generated.prefix,p_expected_id:null,p_encrypted_key:encrypted});
   if(created.error||(!created.data?.ok&&created.data?.code!=="credential_changed"))return activationFailure();
  }
  const r=await connectionDatabase.rpc("houdini_connection",{p_action:"approve",p_id:id,p_user_id:auth.user.id});
  if(r.error||!r.data?.ok)return privateJson({error:"Connection expired or unavailable. Start again in Houdini."},410);
  return privateJson({approved:true});
 }catch{return activationFailure();}
}
