"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import OrderInvoice from "@/components/OrderInvoice";
import ProductDownload from "@/components/ProductDownload";
import { useQAToolsState } from "@/context/QAToolsState";
import type { AccountAccess, AccountOrder, AccountProduct, AccountPurchases } from "@/lib/accountPurchases";
import { formatOrderNumber } from "@/lib/orderNumber";

type ProductRow = {
  id: number;
  product: AccountProduct | null;
  access?: AccountAccess;
  downloadedAt?: string;
  orders: AccountOrder[];
};

const sortOptions = [
  ["date-desc", "Date · newest first"],
  ["date-asc", "Date · oldest first"],
  ["price-asc", "Price · low to high"],
  ["price-desc", "Price · high to low"],
] as const;
type Sort = typeof sortOptions[number][0];
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function accountDate(value?: string | null) {
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? dateFormat.format(date) : "—";
}

function orderDate(order: AccountOrder) {
  return order.provider_created_at ?? order.created_at;
}

function hasInvoice(order: AccountOrder) {
  return ["paddle", "paddle_sandbox"].includes(order.provider)
    && ["paid", "refunded", "partially_refunded"].includes(order.status)
    && order.total > 0 && /^txn_[a-z0-9]{26}$/.test(order.provider_transaction_id ?? "");
}

function groupProducts(account: AccountPurchases | null, orders: AccountOrder[]) {
  const rows = new Map<number, ProductRow>();
  function getRow(id: number, product: AccountProduct | null) {
    const row = rows.get(id) ?? { id, product, orders: [] };
    row.product ??= product;
    rows.set(id, row);
    return row;
  }
  for (const entry of account?.downloads ?? []) {
    getRow(entry.products.id, entry.products).downloadedAt = entry.downloaded_at;
  }
  for (const order of orders) {
    for (const item of order.order_items) {
      const row = getRow(item.product_id, item.products);
      if (!row.orders.some(existing => existing.id === order.id)) row.orders.push(order);
    }
  }
  for (const access of account?.entitlements ?? []) {
    if (!access.products) continue;
    const row = access.direct_acquisition
      ? getRow(access.products.id, access.products)
      : rows.get(access.products.id);
    if (row) {
      row.access = access;
      row.product = { ...row.product, ...access.products };
    }
  }
  for (const row of rows.values()) {
    row.orders.sort((a, b) => Date.parse(orderDate(b)) - Date.parse(orderDate(a)) || b.id - a.id);
  }
  return [...rows.values()];
}

function rowDate(row: ProductRow) {
  return row.downloadedAt ?? row.access?.granted_at ?? (row.orders[0] ? orderDate(row.orders[0]) : null);
}

function Receipt({ order, showInvoice }: { order: AccountOrder; showInvoice: boolean }) {
  return <li className="account-receipt">
    <span>{formatOrderNumber(order.order_number)} · {accountDate(orderDate(order))}</span>
    <span className={`order-state order-state-${order.status}`}>{order.status.replaceAll("_", " ")}</span>
    <span>{Number(order.total).toFixed(2)} {order.currency}</span>
    {showInvoice && hasInvoice(order) && <OrderInvoice orderId={order.id} compact />}
  </li>;
}

export default function AccountProductList({ account, orders, loading, error, refresh }: {
  account: AccountPurchases | null;
  orders: AccountOrder[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}) {
  const { toggleCart, cartReady, isInCart, isPurchased, purchasedLoading } = useQAToolsState();
  const [sort, setSort] = useState<Sort>("date-desc");
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const machineActive = account?.machines.some(machine => machine.status === "active");
  const rows = groupProducts(account, orders).sort((a, b) => {
    const date = (Date.parse(rowDate(b) ?? "") || 0) - (Date.parse(rowDate(a) ?? "") || 0);
    if (sort === "date-asc") return -date || a.id - b.id;
    if (sort === "date-desc") return date || a.id - b.id;
    const aPrice = a.product?.price_eur;
    const bPrice = b.product?.price_eur;
    if (aPrice == null || bPrice == null) return Number(aPrice == null) - Number(bPrice == null) || date || a.id - b.id;
    return (sort === "price-asc" ? aPrice - bPrice : bPrice - aPrice) || date || a.id - b.id;
  });

  function toggleDetails(id: number) {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return <section id="account-products" aria-labelledby="account-products-title">
    <div className="account-dashboard-heading">
      <h2 id="account-products-title">My products</h2>
      <div className="account-product-tools">
        <details>
          <summary className="menu-trigger">Sort</summary>
          <div className="dropdown open sort-menu">
            {sortOptions.map(([value, label]) => <button key={value} type="button"
              className={`sort-option ${value === sort ? "selected" : ""}`} aria-pressed={value === sort}
              onClick={event => { setSort(value); event.currentTarget.closest("details")?.removeAttribute("open"); }}>
              {label}
            </button>)}
          </div>
        </details>
        <button type="button" className="menu-trigger" disabled={loading} onClick={refresh}>Refresh</button>
      </div>
    </div>
    {error && <p className="password-error" role="alert">{error}</p>}
    {loading && <p className="account-muted" role="status">Refreshing products…</p>}
    {!loading && !error && !rows.length && <p className="account-muted">
      Your downloads and purchases will appear here. <Link href="/">Browse products</Link>.
    </p>}
    {rows.length > 0 && <div className="account-product-list">
      {rows.map(row => {
        const { product, access } = row;
        const owned = access?.status === "active";
        const free = product?.price_eur === 0;
        const cartOwned = owned || (product !== null && isPurchased(product.slug));
        const inCart = product !== null && isInCart(product.slug);
        const canToggleCart = cartReady && !purchasedLoading && !cartOwned
          && product?.published && product.price_eur != null && product.price_eur > 0;
        const trialEnd = account?.trial_ends?.[row.id];
        const active = machineActive && (owned || (free && product?.published && product.product_type === "tool"));
        const trial = !owned && !free && machineActive && product?.published && trialEnd
          && Date.parse(trialEnd) > now;
        const invoice = row.orders.find(hasInvoice);
        const downloadable = owned || (product?.published && ["tool", "bundle"].includes(product.product_type));
        const name = product?.name ?? `Item #${row.id}`;
        const detailsId = `account-product-details-${row.id}`;
        const isExpanded = expanded.has(row.id);
        return <article key={row.id} className="account-product" aria-label={name}>
          <div className="account-product-grid account-expandable-row">
            <button type="button" className="account-row-toggle" aria-label={`Details for ${name}`}
              aria-expanded={isExpanded} aria-controls={detailsId} onClick={() => toggleDetails(row.id)}>
              <span className="account-row-toggle-chevron" aria-hidden="true" />
            </button>
            <div className="account-product-download">{downloadable
              ? <ProductDownload productId={row.id} label="Download" buttonClassName="account-action" onDownloaded={refresh} />
              : <button type="button" className="account-action" disabled>Download</button>}
            </div>
            <strong className="account-product-name">{name}</strong>
            <span className={active || trial ? "account-license-active" : "account-license-inactive"}>
              <span className="account-mobile-label">License: </span>{active ? "Active" : trial ? "Free trial" : "Inactive"}
            </span>
            <div className="account-product-invoice">{invoice
              ? <OrderInvoice key={invoice.id} orderId={invoice.id} compact />
              : <button type="button" className="account-action" disabled>Invoice</button>}
            </div>
            <span><span className="account-product-date-label">Last downloaded: </span>{accountDate(row.downloadedAt)}</span>
            <div className="account-product-buy">
              <button type="button" className={`account-action account-cart-action${canToggleCart && inCart ? " in-cart" : ""}`}
                disabled={!canToggleCart} aria-label={canToggleCart && inCart ? "Remove from cart" : undefined}
                onClick={() => { if (canToggleCart) toggleCart(product.slug); }}>
                {cartOwned ? "Owned" : free ? "Free" : inCart ? "In cart" : "Add to cart"}
              </button>
            </div>
          </div>
          <div id={detailsId} className="account-product-details" hidden={!isExpanded}>
            <dl className="account-detail-grid">
              <div><dt>Price</dt><dd>{product?.price_eur == null ? "—" : `€${product.price_eur.toFixed(2)}`}</dd></div>
              <div><dt>Category</dt><dd>{product?.category?.name ?? "—"}</dd></div>
              <div><dt>Version</dt><dd>{product?.current_version ?? "—"}</dd></div>
              {access && <div><dt>Acquired</dt><dd>{accountDate(access.granted_at)} · {access.source}</dd></div>}
              {trialEnd && !owned && <div><dt>Trial ends</dt><dd>{accountDate(trialEnd)}</dd></div>}
            </dl>
            {!!access?.included_tools.length && <div className="account-included">
              <span>Included tools</span>
              <div className="tags">{access.included_tools.map(tool =>
                <Link key={tool.id} className="card-tag" href={`/product?id=${tool.slug}`}>{tool.name}</Link>
              )}</div>
            </div>}
            {row.orders.length > 0 && <>
              <h3>Orders &amp; receipts</h3>
              <ul className="account-receipts">{row.orders.map(order =>
                <Receipt key={order.id} order={order} showInvoice={order.id !== invoice?.id} />
              )}</ul>
            </>}
            {product?.published && <Link className="account-action" href={`/product?id=${product.slug}`}>View product</Link>}
          </div>
        </article>;
      })}
    </div>}
    {orders.some(order => !order.order_items.length) && <details className="account-disclosure">
      <summary>Orders without listed products</summary>
      <ul className="account-receipts">{orders.filter(order => !order.order_items.length).map(order =>
        <Receipt key={order.id} order={order} showInvoice />
      )}</ul>
    </details>}
  </section>;
}
