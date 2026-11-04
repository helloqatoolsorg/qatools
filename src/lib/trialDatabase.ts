import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseAdmin } from "./supabaseAdmin";
type Result={ok:boolean;code?:string;activation?:{id:number;machine_id:string;credential_id:string;activated_at:string};purchased?:string[];free?:string[];trial?:string[];trialStartedAt?:number;trialEndsAt?:number;toolTrials?:Record<string,{startedAt:number;endsAt:number}>};
type TrialDatabase=Database & {public:Database["public"] & {Functions:{
activate_trial_machine:{Args:{p_secret_hash:string;p_machine_id:string};Returns:Result};
read_trial_license:{Args:{p_activation_id:number;p_credential_id:string;p_machine_id:string};Returns:Result};
read_tool_trial_license:{Args:{p_activation_id:number;p_credential_id:string;p_machine_id:string};Returns:Result};
start_tool_trial:{Args:{p_activation_id:number;p_credential_id:string;p_machine_id:string;p_slug:string};Returns:Result};
read_account_trial:{Args:{p_user_id:string};Returns:{startedAt:string;endsAt:string}|null};
}}};
export const trialDatabase=supabaseAdmin as SupabaseClient<TrialDatabase>;
