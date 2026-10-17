import type { OrderStatus, Product, ShippingMethod } from '../database/schema.ts';

/** Pure pricing and catalog helpers (no runtime needed; unit-testable). All money in cents. */

export const FREE_SHIPPING_THRESHOLD_CENTS = 7500;
export const SHIPPING_RATES: Record<ShippingMethod, { label: string; cents: number; eta: string }> =
  {
    standard: { label: 'Standard', cents: 599, eta: '3–5 business days' },
    express: { label: 'Express', cents: 1499, eta: '1–2 business days' },
  };
/** Flat simulated sales tax, in basis points (8.25%). */
export const TAX_RATE_BPS = 825;
export const LOW_STOCK_THRESHOLD = 5;

export interface PricedLine {
  unitPriceCents: number;
  quantity: number;
}

export interface Totals {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  itemCount: number;
}

export function computeTotals(lines: readonly PricedLine[], method: ShippingMethod): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const shippingCents =
    itemCount === 0
      ? 0
      : method === 'standard' && subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
        ? 0
        : SHIPPING_RATES[method].cents;
  const taxCents = Math.round((subtotalCents * TAX_RATE_BPS) / 10_000);
  return {
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents: subtotalCents + shippingCents + taxCents,
    itemCount,
  };
}

/** "24.99" / "24" / "$1,024.5" → 2499 / 2400 / 102450; `null` when not a valid amount. */
export function parseDollars(input: string): number | null {
  const clean = input.trim().replace(/[$,\s]/g, '');
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export const centsToInput = (cents: number) => (cents / 100).toFixed(2);

export type StockState = 'in-stock' | 'low' | 'sold-out';

export function stockState(product: Pick<Product, 'stock'>): StockState {
  if (product.stock <= 0) return 'sold-out';
  return product.stock <= LOW_STOCK_THRESHOLD ? 'low' : 'in-stock';
}

export const SORTS = {
  featured: 'Featured',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  rating: 'Top rated',
  name: 'Name A–Z',
} as const;
export type SortKey = keyof typeof SORTS;

export interface CatalogFilter {
  query?: string;
  categoryId?: string;
  minCents?: number | null;
  maxCents?: number | null;
  inStockOnly?: boolean;
  sort?: SortKey;
}

export function filterProducts(products: readonly Product[], filter: CatalogFilter): Product[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  const result = products.filter(
    (p) =>
      (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) &&
      (!filter.categoryId || p.categoryId === filter.categoryId) &&
      (filter.minCents == null || p.priceCents >= filter.minCents) &&
      (filter.maxCents == null || p.priceCents <= filter.maxCents) &&
      (!filter.inStockOnly || p.stock > 0)
  );
  const sort = filter.sort ?? 'featured';
  const by: Record<SortKey, (a: Product, b: Product) => number> = {
    featured: (a, b) => a.featuredRank - b.featuredRank,
    'price-asc': (a, b) => a.priceCents - b.priceCents,
    'price-desc': (a, b) => b.priceCents - a.priceCents,
    rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return result.sort((a, b) => by[sort](a, b) || a.id.localeCompare(b.id));
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Placed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
