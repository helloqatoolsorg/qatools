import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseAdmin } from "./supabaseAdmin";

// RPC schema from 20261003080000; kept alongside this integration.
type CheckoutDatabase = Database & { public: Database["public"] & {
  Functions: Database["public"]["Functions"] & {
    reserve_sandbox_checkout: {
      Args: { p_user_id: string; p_product_id: number };
      Returns: { ok: boolean; code?: string; created?: boolean; intent?: { id: string; status: string; transaction_id: string | null } };
    };
    finish_sandbox_checkout: {
      Args: { p_user_id: string; p_intent_id: string; p_transaction_id: string | null };
      Returns: boolean;
    };
  };
} };
export const paddleCheckoutDatabase = supabaseAdmin as SupabaseClient<CheckoutDatabase>;
