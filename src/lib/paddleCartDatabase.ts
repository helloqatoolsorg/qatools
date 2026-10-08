import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseAdmin } from "./supabaseAdmin";
export type CartLine = { productId: number; slug: string; priceId: string; paddleProductId: string; amount: number };
export type PriceMapping = { product_id: number; price_id: string; paddle_product_id: string; enabled: boolean };
export type CatalogSetup = { product_id: number; attempt_id: string; slug: string; amount_cents: number; status: string; paddle_product_id: string | null; price_id: string | null };
type Intent = { id: string; status: string; transaction_id: string | null; snapshot: CartLine[]; version: string };
type SandboxCartDatabase = Database & { public: Database["public"] & {
  Tables: {
    sandbox_product_prices: { Row: PriceMapping; Insert: never; Update: never; Relationships: [] };
    sandbox_catalog_setups: { Row: CatalogSetup; Insert: never; Update: never; Relationships: [] };
  };
  Functions: {
    reserve_sandbox_catalog_setup: { Args: { p_admin_id: string; p_product_id: number; p_slug: string; p_amount: number }; Returns: { ok: boolean; created?: boolean; job?: CatalogSetup } };
    advance_sandbox_catalog_setup: { Args: { p_admin_id: string; p_attempt_id: string; p_from: string; p_to: string; p_paddle_product_id: string | null; p_price_id: string | null }; Returns: boolean };
    complete_sandbox_catalog_setup: { Args: { p_admin_id: string; p_attempt_id: string }; Returns: boolean };
    set_sandbox_product_price: { Args: { p_admin_id: string; p_product_id: number; p_expected_price: string; p_expected_enabled: boolean; p_price_id: string; p_paddle_product_id: string; p_enabled: boolean }; Returns: { ok: boolean } };
    reserve_sandbox_cart: { Args: { p_user_id: string; p_items: CartLine[] }; Returns: { ok: boolean; code?: string; created?: boolean; intent?: Intent } };
  };
} };
type LiveNames<T> = { [K in keyof T as K extends `sandbox_${infer S}` ? `live_${S}` : K extends `${infer P}_sandbox_${infer S}` ? `${P}_live_${S}` : never]: T[K] };
type CartDatabase = SandboxCartDatabase & { public: SandboxCartDatabase["public"] & {
 Tables: LiveNames<SandboxCartDatabase["public"]["Tables"]>;
 Functions: LiveNames<SandboxCartDatabase["public"]["Functions"]> & {
  live_product_publication_checks: Database["public"]["Functions"]["product_publication_checks"];
  publish_live_product_draft: Database["public"]["Functions"]["publish_product_draft"];
 };
} };
export const paddleCartDatabase = supabaseAdmin as SupabaseClient<CartDatabase>;
