import "server-only";
import { paddleSandboxApiConfig } from "./paddleSandbox";

export async function readSandboxInvoice(transactionId: string): Promise<string> {
  if (!/^txn_[a-z0-9]{26}$/.test(transactionId)) throw new Error("Invalid transaction.");
  const config = paddleSandboxApiConfig();
  const response = await fetch(config.apiBase + "/transactions/" + transactionId + "/invoice?disposition=attachment", {
    headers: { Authorization: "Bearer " + config.apiKey },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Invoice unavailable.");
  const data = (await response.json())?.data;
  if (typeof data?.url !== "string" || data.url.length > 8192) throw new Error("Invalid invoice response.");
  const url = new URL(data.url);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid invoice URL.");
  // Temporary provider-issued link: returned on demand, never persisted or fetched by this server.
  return url.href;
}
