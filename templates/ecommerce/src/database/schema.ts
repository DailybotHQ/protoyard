import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Storefront data model. All money is INTEGER CENTS (`priceCents: 2499` =
 * $24.99) so totals never suffer floating-point drift.
 *
 * category 1─* product, order 1─* orderItem *─1 product. Cart lines are
 * per persona (`customerId` → `py_personas`) so switching persona in
 * DevTools switches carts. To add a table, add a NEW version and bump
 * `storage.schemaVersion` in protoyard.json.
 */

export const ORDER_STATUSES = [
  'placed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SHIPPING_METHODS = ['standard', 'express'] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

export type Product = {
  id: string;
  name: string;
  categoryId: string;
  description: string;
  priceCents: number;
  /** Optional "was" price for items on sale. */
  compareAtCents: number | null;
  stock: number;
  /** 0–5, one decimal. */
  rating: number;
  reviewCount: number;
  /** Hue (0–359) for the generated product artwork. */
  hue: number;
  /** Popularity rank used by the "Featured" sort (lower = more featured). */
  featuredRank: number;
  createdAt: string;
  updatedAt: string;
};

export type CartItem = {
  /** `${customerId}:${productId}` — one line per product per customer. */
  id: string;
  customerId: string;
  productId: string;
  quantity: number;
  addedAt: string;
};

export type ShippingAddress = {
  fullName: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
};

export type Order = {
  id: string;
  /** Human-facing order number, e.g. `FS-10042`. */
  number: string;
  customerId: string;
  status: OrderStatus;
  shippingMethod: ShippingMethod;
  shipping: ShippingAddress;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  itemCount: number;
  placedAt: string;
  updatedAt: string;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  /** Snapshot of the product at purchase time. */
  name: string;
  unitPriceCents: number;
  quantity: number;
};

export type ShopDatabase = Dexie & {
  categories: EntityTable<Category, 'id'>;
  products: EntityTable<Product, 'id'>;
  cartItems: EntityTable<CartItem, 'id'>;
  orders: EntityTable<Order, 'id'>;
  orderItems: EntityTable<OrderItem, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        categories: 'id, slug',
        products: 'id, categoryId, priceCents, stock, name, featuredRank',
        cartItems: 'id, customerId, productId',
        orders: 'id, number, customerId, status, placedAt',
        orderItems: 'id, orderId, productId',
      },
    },
  ],
};
