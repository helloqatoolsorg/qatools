import "server-only";

import { supabaseAdmin } from "./supabaseAdmin";
import { paddleApiConfig, type PaddleEnvironment } from "./paddleEnvironment";
import { cartRecord } from "./paddleCartValidation";
import { paddleScope } from "./paddleScope";

export type PaddleCheckoutBilling = {
  customer_id: string;
  address_id?: string;
  business_id?: string;
};

export async function readPaddleCheckoutBilling(
  account: { id: string; email?: string },
  environment: PaddleEnvironment,
): Promise<PaddleCheckoutBilling | undefined> {
  if (!account.email) return;
  try {
    const signal = AbortSignal.timeout(2500);
    // A signed, fulfilled order is the account-to-transaction link. The browser supplies no billing IDs.
    const { data, error } = await supabaseAdmin.from("orders")
      .select("provider_transaction_id")
      .eq("user_id", account.id)
      .eq("provider", paddleScope(environment).provider)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .abortSignal(signal)
      .maybeSingle();
    const previousId = data?.provider_transaction_id;
    if (error || !previousId || !/^txn_[a-z0-9]{26}$/.test(previousId)) return;

    const { apiBase, apiKey } = paddleApiConfig(environment);
    async function read(path?: string): Promise<Record<string, unknown>> {
      if (!path) return {};
      try {
        const response = await fetch(apiBase + path, {
          headers: { Authorization: "Bearer " + apiKey },
          cache: "no-store", redirect: "error", signal,
        });
        return response.ok ? cartRecord((await response.json()).data) : {};
      } catch { return {}; }
    }
    const previous = await read("/transactions/" + previousId);
    const customerId = previous.customer_id;
    if (previous.id !== previousId || previous.status !== "completed" || previous.collection_mode !== "automatic" ||
        typeof customerId !== "string" || !/^ctm_[a-z0-9]{26}$/.test(customerId)) return;

    const customerPath = "/customers/" + customerId;
    const addressId = previous.address_id;
    const businessId = previous.business_id;
    const [customer, address, business] = await Promise.all([
      read(customerPath),
      read(typeof addressId === "string" && /^add_[a-z0-9]{26}$/.test(addressId)
        ? customerPath + "/addresses/" + addressId : undefined),
      read(typeof businessId === "string" && /^biz_[a-z0-9]{26}$/.test(businessId)
        ? customerPath + "/businesses/" + businessId : undefined),
    ]);
    if (customer.id !== customerId || customer.status !== "active" ||
        typeof customer.email !== "string" || customer.email.toLowerCase() !== account.email.toLowerCase()) return;

    const billing: PaddleCheckoutBilling = { customer_id: customerId };
    if (typeof addressId === "string" && address.id === addressId && address.customer_id === customerId && address.status === "active") {
      billing.address_id = addressId;
      if (typeof businessId === "string" && business.id === businessId && business.customer_id === customerId && business.status === "active") {
        billing.business_id = businessId;
      }
    }
    return billing;
  } catch {
    // Checkout remains available when optional history or provider reads are unavailable.
    return undefined;
  }
}
