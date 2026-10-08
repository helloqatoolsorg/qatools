import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseAdmin } from "./supabaseAdmin";

// Read schema from the applied sandbox migrations; no direct writes are exposed.
type SandboxReviewDatabase = Database & { public: Database["public"] & { Tables: {
  sandbox_payment_events: {
    Row: { event_id: string; event_type: string; transaction_id: string | null; outcome: string; occurred_at: string; received_at: string };
    Insert: never; Update: never; Relationships: [];
  };
  sandbox_checkout_intents: {
    Row: { id: string; user_id: string; product_id: number; status: string; currency: string; amount_cents: number; charged_amount_cents: number | null; transaction_id: string | null; created_at: string; updated_at: string };
    Insert: never; Update: never; Relationships: [];
  };
} } };
type ReviewDatabase = SandboxReviewDatabase & { public: SandboxReviewDatabase["public"] & { Tables: {
 live_payment_events: SandboxReviewDatabase["public"]["Tables"]["sandbox_payment_events"];
 live_checkout_intents: SandboxReviewDatabase["public"]["Tables"]["sandbox_checkout_intents"];
} } };
export const paymentReviewDatabase = supabaseAdmin as SupabaseClient<ReviewDatabase>;
