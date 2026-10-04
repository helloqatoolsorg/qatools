import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseAdmin } from "./supabaseAdmin";
export type CartLine = { productId: number; slug: string; priceId: string; paddleProductId: string; amount: number };
export type PriceMapping = { product_id: number; price_id: string; paddle_product_id: string; enabled: boolean };
type Intent = { id: string; status: string; transaction_id: string | null; snapshot: CartLine[]; version: string };
type CartDatabase = Database & { public: Database["public"] & {
  Tables: { sandbox_product_prices: { Row: PriceMapping; Insert: never; Update: never; Relationships: [] } };
  Functions: {
    set_sandbox_product_price: { Args: { p_admin_id: string; p_product_id: number; p_expected_price: string; p_expected_enabled: boolean; p_price_id: string; p_paddle_product_id: string; p_enabled: boolean }; Returns: { ok: boolean } };
    reserve_sandbox_cart: { Args: { p_user_id: string; p_items: CartLine[] }; Returns: { ok: boolean; code?: string; created?: boolean; intent?: Intent } };
  };
} };
export const paddleCartDatabase = supabaseAdmin as SupabaseClient<CartDatabase>;
