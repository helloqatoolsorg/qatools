import "server-only";

// Explicit sandbox configuration. Public launch/live payments are a separate step.
export function paddleSandboxApiConfig() {
  const environment = process.env.PADDLE_ENVIRONMENT;
  const apiKey = process.env.PADDLE_API_KEY;
  if (environment !== "sandbox") throw new Error("Paddle sandbox environment must be configured explicitly.");
  if (!apiKey?.startsWith("pdl_sdbx_apikey_") || /\s/.test(apiKey)) throw new Error("A Paddle sandbox API key is required.");
  return { environment: "sandbox" as const, apiBase: "https://sandbox-api.paddle.com", apiKey };
}

export function paddleSandboxConfig() {
  const api = paddleSandboxApiConfig();
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!clientToken || !/^test_[A-Za-z0-9_-]+$/.test(clientToken)) throw new Error("A Paddle sandbox client token is required.");
  if (!webhookSecret || webhookSecret.length > 512 || /\s/.test(webhookSecret)) throw new Error("A Paddle webhook destination secret is required.");
  return { ...api, webhookSecret, clientToken };
}
