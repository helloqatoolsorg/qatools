import { requireAccount } from "@/lib/requireAccount";
import { privateJson } from "@/lib/activationHttp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export async function GET(request:Request){
 try{
  const auth=await requireAccount(request,"view your purchases");if(auth.response)return auth.response;
  const {data,error}=await supabaseAdmin.rpc("read_account_purchases",{p_user_id:auth.user.id});
  if(error || !data?.ok)return privateJson({error:"Unable to load purchases and account machine. Please try again."},503);
  return privateJson(data);
 }catch{return privateJson({error:"Unable to load purchases and account machine. Please try again."},503);}
}
