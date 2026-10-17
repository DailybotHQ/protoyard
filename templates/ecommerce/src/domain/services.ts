import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import { z } from 'zod';
import {
  type CartItem,
  ORDER_STATUSES,
  type Order,
  type OrderItem,
  type OrderStatus,
  SHIPPING_METHODS,
  type ShopDatabase,
} from '../database/schema.ts';
import { computeTotals, parseDollars } from './catalog.ts';
import { CAPABILITIES } from './policy.ts';

/**
 * Domain services: the ONLY way the UI changes data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — holds even if the UI is bypassed,
 *   2. validates input with zod (field errors render inline in forms),
 *   3. runs through the simulated environment (latency / offline / failures) —
 *      when the environment refuses, NOTHING is written,
 *   4. writes related rows in ONE Dexie transaction. Checkout decrements stock,
 *      creates the order and empties the cart atomically: if any line lacks
 *      stock the transaction aborts and every earlier write rolls back.
 *
 * This is a demo: there is no payment, card data is never requested.
 */

export const MAX_QUANTITY = 10;

export const COUNTRIES = [
  'United States',
  'Canada',
  'Mexico',
  'Colombia',
  'United Kingdom',
  'Germany',
  'Spain',
  'Australia',
] as const;

export const CheckoutSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the recipient’s name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  address: z.string().trim().min(5, 'Enter a street address').max(120),
  city: z.string().trim().min(2, 'Enter a city').max(60),
  postalCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/, 'Enter a valid postal code'),
  country: z.string().refine((v) => (COUNTRIES as readonly string[]).includes(v), 'Pick a country'),
  shippingMethod: z.enum(SHIPPING_METHODS).default('standard'),
});
export type CheckoutInput = z.input<typeof CheckoutSchema>;

export const ProductEditSchema = z.object({
  price: z
    .string()
    .transform((v) => parseDollars(v))
    .refine((v): v is number => v !== null && v >= 50, 'Enter a price of at least $0.50'),
  compareAt: z
    .string()
    .transform((v) => (v.trim() === '' ? null : parseDollars(v)))
    .refine((v) => v === null || v > 0, 'Enter a valid amount or leave empty'),
  stock: z.coerce
    .number({ message: 'Enter a whole number' })
    .int('Enter a whole number')
    .min(0, 'Stock cannot be negative')
    .max(9999, 'Keep stock under 10,000'),
});
export type ProductEditInput = z.input<typeof ProductEditSchema>;

export class ValidationError extends Error {
  readonly issues: Record<string, string>;
  constructor(issues: Record<string, string>) {
    super(Object.values(issues)[0] ?? 'Invalid input');
    this.issues = issues;
    this.name = 'ValidationError';
  }
}

export interface Shortage {
  productId: string;
  name: string;
  requested: number;
  available: number;
}

/** Thrown inside the checkout transaction so Dexie rolls every write back. */
export class InsufficientStockError extends ValidationError {
  readonly shortages: Shortage[];
  constructor(shortages: Shortage[]) {
    const first = shortages[0];
    super({
      stock: first
        ? first.available === 0
          ? `${first.name} just sold out.`
          : `Only ${first.available} × ${first.name} left.`
        : 'Some items are no longer available.',
    });
    this.name = 'InsufficientStockError';
    this.shortages = shortages;
  }
}

export class EmptyCartError extends ValidationError {
  constructor() {
    super({ cart: 'Your cart is empty.' });
    this.name = 'EmptyCartError';
  }
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'form';
    issues[key] ??= issue.message;
  }
  throw new ValidationError(issues);
}

/** Statuses an order may move to (no going backwards, no reviving cancelled orders). */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  placed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function createShopServices(runtime: PrototypeRuntime<ShopDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const customerId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };
  const lineId = (productId: string) => `${customerId()}:${productId}`;

  async function setLine(productId: string, quantity: number, mode: 'add' | 'set') {
    if (!Number.isInteger(quantity) || quantity < (mode === 'add' ? 1 : 0)) {
      throw new ValidationError({ quantity: 'Enter a whole quantity' });
    }
    const id = lineId(productId);
    const owner = customerId();
    await environment.run('cart.update', () =>
      db.transaction('rw', db.products, db.cartItems, async () => {
        const product = await db.products.get(productId);
        if (!product) throw new ValidationError({ quantity: 'This product is no longer sold.' });
        const existing = await db.cartItems.get(id);
        const next = mode === 'add' ? (existing?.quantity ?? 0) + quantity : quantity;
        if (next === 0) {
          await db.cartItems.delete(id);
          return;
        }
        if (product.stock <= 0)
          throw new ValidationError({ quantity: `${product.name} is sold out.` });
        if (next > product.stock) {
          throw new ValidationError({
            quantity: `Only ${product.stock} left — you already have ${existing?.quantity ?? 0} in your cart.`,
          });
        }
        if (next > MAX_QUANTITY) {
          throw new ValidationError({ quantity: `Limit ${MAX_QUANTITY} per customer.` });
        }
        const line: CartItem = {
          id,
          customerId: owner,
          productId,
          quantity: next,
          addedAt: existing?.addedAt ?? now(),
        };
        await db.cartItems.put(line);
      })
    );
  }

  return {
    cart: {
      async add(productId: string, quantity = 1): Promise<void> {
        session.assert(CAPABILITIES.cart);
        return setLine(productId, quantity, 'add');
      },
      async setQuantity(productId: string, quantity: number): Promise<void> {
        session.assert(CAPABILITIES.cart);
        return setLine(productId, quantity, 'set');
      },
      async remove(productId: string): Promise<void> {
        session.assert(CAPABILITIES.cart);
        const id = lineId(productId);
        await environment.run('cart.update', () => db.cartItems.delete(id));
      },
      async clear(): Promise<void> {
        session.assert(CAPABILITIES.cart);
        const owner = customerId();
        await environment.run('cart.update', () =>
          db.cartItems.where('customerId').equals(owner).delete()
        );
      },
    },

    checkout: {
      /**
       * Places an order for the current cart in ONE transaction: re-reads every
       * product, refuses (and rolls back) if any line lacks stock, decrements
       * inventory, writes the order + items at current prices, empties the cart.
       */
      async placeOrder(input: CheckoutInput): Promise<Order> {
        session.assert(CAPABILITIES.checkout);
        const data = parse(CheckoutSchema, input);
        const owner = customerId();
        return environment.run('checkout.placeOrder', () =>
          db.transaction('rw', [db.products, db.cartItems, db.orders, db.orderItems], async () => {
            const lines = await db.cartItems.where('customerId').equals(owner).sortBy('addedAt');
            if (lines.length === 0) throw new EmptyCartError();
            const orderId = createRuntimeId('order');
            const items: OrderItem[] = [];
            const shortages: Shortage[] = [];
            for (const line of lines) {
              const product = await db.products.get(line.productId);
              if (!product || product.stock < line.quantity) {
                shortages.push({
                  productId: line.productId,
                  name: product?.name ?? 'A removed product',
                  requested: line.quantity,
                  available: Math.max(0, product?.stock ?? 0),
                });
                continue;
              }
              // Decrement as we go: a later shortage aborts the transaction and
              // Dexie rolls these writes back.
              await db.products.update(product.id, {
                stock: product.stock - line.quantity,
                updatedAt: now(),
              });
              items.push({
                id: createRuntimeId('item'),
                orderId,
                productId: product.id,
                name: product.name,
                unitPriceCents: product.priceCents,
                quantity: line.quantity,
              });
            }
            if (shortages.length > 0) throw new InsufficientStockError(shortages);

            const numbers = await db.orders.toArray();
            const last = numbers.reduce(
              (max, o) => Math.max(max, Number(o.number.replace(/\D/g, '')) || 0),
              10_000
            );
            const at = now();
            const order: Order = {
              id: orderId,
              number: `FS-${last + 1}`,
              customerId: owner,
              status: 'placed',
              shippingMethod: data.shippingMethod,
              shipping: {
                fullName: data.fullName,
                email: data.email,
                address: data.address,
                city: data.city,
                postalCode: data.postalCode.toUpperCase(),
                country: data.country,
              },
              ...computeTotals(items, data.shippingMethod),
              placedAt: at,
              updatedAt: at,
            };
            await db.orders.add(order);
            await db.orderItems.bulkAdd(items);
            await db.cartItems.where('customerId').equals(owner).delete();
            return order;
          })
        );
      },
    },

    orders: {
      /** Cancelling returns the items to inventory in the same transaction. */
      async cancel(orderId: string): Promise<void> {
        const order = await db.orders.get(orderId);
        if (!order) throw new ValidationError({ order: 'This order no longer exists.' });
        session.assert(CAPABILITIES.ordersCancel, order);
        if (order.status !== 'placed' && order.status !== 'processing') {
          throw new ValidationError({
            order: 'Only orders that have not shipped can be cancelled.',
          });
        }
        await environment.run('orders.cancel', () =>
          db.transaction('rw', db.orders, db.orderItems, db.products, async () => {
            for (const item of await db.orderItems.where('orderId').equals(orderId).toArray()) {
              const product = await db.products.get(item.productId);
              if (product) {
                await db.products.update(product.id, {
                  stock: product.stock + item.quantity,
                  updatedAt: now(),
                });
              }
            }
            await db.orders.update(orderId, { status: 'cancelled', updatedAt: now() });
          })
        );
      },

      async setStatus(orderId: string, status: OrderStatus): Promise<void> {
        session.assert(CAPABILITIES.ordersManage);
        if (!ORDER_STATUSES.includes(status))
          throw new ValidationError({ status: 'Unknown status' });
        const order = await db.orders.get(orderId);
        if (!order) throw new ValidationError({ order: 'This order no longer exists.' });
        if (status === order.status) return;
        if (status === 'cancelled') return this.cancel(orderId);
        if (!NEXT_STATUSES[order.status].includes(status)) {
          throw new ValidationError({ status: `A ${order.status} order cannot become ${status}.` });
        }
        await environment.run('orders.update', () =>
          db.orders.update(orderId, { status, updatedAt: now() })
        );
      },
    },

    products: {
      async update(id: string, input: ProductEditInput): Promise<void> {
        session.assert(CAPABILITIES.productsManage);
        const data = parse(ProductEditSchema, input);
        if (data.compareAt !== null && data.compareAt <= data.price) {
          throw new ValidationError({ compareAt: 'The “was” price must be higher than the price' });
        }
        await environment.run('products.update', () =>
          db.transaction('rw', db.products, async () => {
            if (!(await db.products.get(id))) {
              throw new ValidationError({ price: 'This product no longer exists.' });
            }
            await db.products.update(id, {
              priceCents: data.price,
              compareAtCents: data.compareAt,
              stock: data.stock,
              updatedAt: now(),
            });
          })
        );
      },
    },
  };
}

export type ShopServices = ReturnType<typeof createShopServices>;
