import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { privateJson } from "@/lib/activationHttp";
import { productKindLabel } from "@/lib/productKind";

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) {
      auth.response.headers.set("Cache-Control", "no-store");
      return auth.response;
    }

    const [products, orders] = await Promise.allSettled([
      supabaseAdmin.from("products").select("id,name,subtitle,price_eur,published,product_type,prepared_identity,product_media(id,file_path,role,sort_order),category(name),complexity(name)")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false }).limit(3),
      supabaseAdmin.rpc("read_admin_orders", {
        p_admin_id: auth.user.id, p_page: 1, p_status: "all", p_sort: "date", p_direction: "desc",
      }),
    ]);

    return privateJson({
      products: products.status === "fulfilled" && !products.value.error
        ? products.value.data?.map(({ category, complexity, product_type, prepared_identity, ...product }) => ({
          ...product,
          labels: [category?.name, complexity?.name, productKindLabel({product_type, prepared_identity})].filter(Boolean),
        })) ?? null
        : null,
      orders: orders.status === "fulfilled" && !orders.value.error && Array.isArray(orders.value.data?.orders)
        ? orders.value.data.orders.slice(0, 10).map(({ id, order_number, customerEmail, status, total, currency, created_at }) =>
          ({ id, order_number, customerEmail, status, total, currency, created_at }))
        : null,
    });
  } catch {
    return privateJson({ error: "Unable to load recent activity." }, 503);
  }
}
