export type AccountProduct = {
  id: number;
  name: string;
  slug: string;
  current_version: string | null;
  product_type: string;
  category: { name: string } | null;
  price_eur?: number | null;
  published?: boolean;
};

export type AccountAccess = {
  id: number;
  status: string;
  source: string;
  granted_at: string;
  direct_acquisition: boolean;
  products: AccountProduct | null;
  included_tools: { id: number; name: string; slug: string }[];
};

export type AccountPurchases = {
  ok: boolean;
  entitlements: AccountAccess[];
  machines: { id: number; machine_id: string; status: string; activated_at: string }[];
  downloads?: { products: AccountProduct; downloaded_at: string }[];
  trial_ends?: Record<string, string>;
};

export type AccountOrder = {
  id: number;
  order_number: string | null;
  provider: string;
  provider_transaction_id: string | null;
  status: string;
  currency: string;
  total: number;
  provider_created_at: string | null;
  created_at: string;
  order_items: { product_id: number; products: AccountProduct | null }[];
};
