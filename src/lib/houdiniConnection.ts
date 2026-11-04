import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {supabaseAdmin} from "./supabaseAdmin";
import type {Database} from "./database.types";
type Result={ok:boolean;code?:string;pending?:boolean;expiresAt?:string;machineName?:string;machineId?:string;displayCode?:string;approved?:boolean;activation?:{id:number;credential_id:string;machine_id:string}};
type ConnectionDatabase=Database & {public:Database["public"] & {Functions:{houdini_connection:{Args:{p_action:string;p_id:string;p_secret_hash?:string;p_machine_id?:string;p_machine_name?:string;p_display_code?:string;p_user_id?:string};Returns:Result}}}};
export const connectionDatabase=supabaseAdmin as SupabaseClient<ConnectionDatabase>;
export const validConnectionId=(id:unknown):id is string=>typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
