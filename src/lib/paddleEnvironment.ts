import "server-only";

export type PaddleEnvironment = "sandbox" | "live";

export function paddleEnvironment(): PaddleEnvironment {
  const value = process.env.PADDLE_ENVIRONMENT;
  if (value !== "sandbox" && value !== "live") throw new Error("Choose an explicit Paddle environment.");
  return value;
}

// Credentials belong to an environment, including when reading historical orders.
// Legacy variables are accepted only for the existing sandbox deployment.
function credentials(environment: PaddleEnvironment) {
  if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid Paddle environment.");
  if (environment === "live") return {
    apiKey: process.env.PADDLE_LIVE_API_KEY,
    clientToken: process.env.PADDLE_LIVE_CLIENT_TOKEN,
    webhookSecret: process.env.PADDLE_LIVE_WEBHOOK_SECRET,
  };
  const legacy = process.env.PADDLE_ENVIRONMENT === "sandbox";
  return {
    apiKey: process.env.PADDLE_SANDBOX_API_KEY ?? (legacy ? process.env.PADDLE_API_KEY : undefined),
    clientToken: process.env.PADDLE_SANDBOX_CLIENT_TOKEN ?? (legacy ? process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN : undefined),
    webhookSecret: process.env.PADDLE_SANDBOX_WEBHOOK_SECRET ?? (legacy ? process.env.PADDLE_WEBHOOK_SECRET : undefined),
  };
}

export function paddleApiConfig(environment: PaddleEnvironment) {
  const { apiKey } = credentials(environment);
  const prefix = environment === "sandbox" ? "pdl_sdbx_apikey_" : "pdl_live_apikey_";
  if (!apiKey || apiKey.length > 512 || !apiKey.startsWith(prefix) || apiKey.length === prefix.length || /\s/.test(apiKey)) {
    throw new Error("A matching Paddle API key is required.");
  }
  return { environment, apiKey, apiBase: environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com" };
}

export function paddleWebhookSecret(environment: PaddleEnvironment): string {
  const { webhookSecret } = credentials(environment);
  if (!webhookSecret || webhookSecret.length > 512 || /\s/.test(webhookSecret)) throw new Error("A Paddle destination secret is required.");
  return webhookSecret;
}

export function paddleCheckoutConfig(environment: PaddleEnvironment) {
  const api = paddleApiConfig(environment);
  const { clientToken, webhookSecret } = credentials(environment);
  const pattern = environment === "sandbox" ? /^test_[A-Za-z0-9_-]+$/ : /^live_[A-Za-z0-9_-]+$/;
  if (!clientToken || clientToken.length > 512 || !pattern.test(clientToken)) throw new Error("A matching Paddle client token is required.");
  if (!webhookSecret || webhookSecret.length > 512 || /\s/.test(webhookSecret)) throw new Error("A Paddle destination secret is required.");
  return { ...api, clientToken, webhookSecret };
}

export function paddleCheckoutEnabled(environment: PaddleEnvironment): boolean {
  // Invalid or incomplete credentials cannot make a checkout available.
  try {
    if (paddleEnvironment() !== environment) return false;
    const enabled = environment === "live" ? process.env.PADDLE_LIVE_CHECKOUT_ENABLED : process.env.PADDLE_SANDBOX_CHECKOUT_ENABLED;
    if (enabled !== "true") return false;
    paddleCheckoutConfig(environment);
    return true;
  } catch { return false; }
}

export function paddleEnvironmentForProvider(provider: string): PaddleEnvironment | null {
  if (provider === "paddle_sandbox") return "sandbox";
  if (provider === "paddle") return "live";
  return null;
}
