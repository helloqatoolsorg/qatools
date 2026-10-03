import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { normalizePaddleEvent } from "./paddleFulfillment";
import { supabaseAdmin } from "./supabaseAdmin";

type WebhookDatabase = Database & { public: Database["public"] & {
  Functions: Database["public"]["Functions"] & {
    process_sandbox_payment_event: {
      Args: { p_event: ReturnType<typeof normalizePaddleEvent>; p_body_hash: string };
      Returns: { ok: boolean; outcome?: string };
    };
  };
} };
export const paddleWebhookDatabase = supabaseAdmin as SupabaseClient<WebhookDatabase>;
