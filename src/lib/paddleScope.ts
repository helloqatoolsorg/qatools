import "server-only";
import type { PaddleEnvironment } from "./paddleEnvironment";
export function paddleScope(environment: PaddleEnvironment) {
 if(environment === "sandbox") return { prices:"sandbox_product_prices",jobs:"sandbox_catalog_setups",intents:"sandbox_checkout_intents",events:"sandbox_payment_events",reserve:"reserve_sandbox_cart",finish:"finish_sandbox_checkout",reserveCatalog:"reserve_sandbox_catalog_setup",advanceCatalog:"advance_sandbox_catalog_setup",completeCatalog:"complete_sandbox_catalog_setup",setPrice:"set_sandbox_product_price",checks:"product_publication_checks",publish:"publish_product_draft",provider:"paddle_sandbox" } as const;
 if(environment === "live") return { prices:"live_product_prices",jobs:"live_catalog_setups",intents:"live_checkout_intents",events:"live_payment_events",reserve:"reserve_live_cart",finish:"finish_live_checkout",reserveCatalog:"reserve_live_catalog_setup",advanceCatalog:"advance_live_catalog_setup",completeCatalog:"complete_live_catalog_setup",setPrice:"set_live_product_price",checks:"live_product_publication_checks",publish:"publish_live_product_draft",provider:"paddle" } as const;
 throw new Error("Invalid Paddle environment.");
}
