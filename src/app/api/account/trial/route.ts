import { requireAccount } from "@/lib/requireAccount";
import { privateJson } from "@/lib/activationHttp";
import { trialDatabase } from "@/lib/trialDatabase";

export async function GET(request: Request) {
  const auth = await requireAccount(request, "view your trial");
  if (auth.response) return auth.response;
  const { data, error } = await trialDatabase.rpc("read_account_trial", {p_user_id: auth.user.id});
  if (error) return privateJson({error:"Unable to load trial status."},503);
  return privateJson({trial:data});
}
