import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { ShopDatabase } from '../src/database/schema.ts';
import {
  type CheckoutInput,
  createShopServices,
  InsufficientStockError,
  ValidationError,
} from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

/**
 * Checkout on the REAL runtime with an in-memory IndexedDB: atomic order
 * placement, rollback on insufficient stock, offline failure that writes
 * nothing, persistence across reloads and service-level permissions.
 */

let harness = createHarness<ShopDatabase>(definition);
afterEach(() => harness.closeAll());
const fresh = () => {
  harness = createHarness<ShopDatabase>(definition);
};

const address: CheckoutInput = {
  fullName: 'Chloe Park',
  email: 'chloe.park@example.com',
  address: '42 Lakeview Dr',
  city: 'Portland',
  postalCode: '97201',
  country: 'United States',
  shippingMethod: 'standard',
};

async function snapshot(db: ShopDatabase) {
  return {
    products: await db.products.orderBy('id').toArray(),
    cart: await db.cartItems.orderBy('id').toArray(),
    orders: await db.orders.orderBy('id').toArray(),
    items: await db.orderItems.orderBy('id').toArray(),
  };
}

describe('storefront services on the real runtime', () => {
  it('places an order atomically: stock down, order + items written, cart emptied — persisted', async () => {
    fresh();
    let runtime = await harness.boot('new-shopper');
    let shop = createShopServices(runtime);
    const [a, b] = await runtime.db.products.orderBy('id').limit(2).toArray();
    if (!a || !b) throw new Error('catalog');

    await shop.cart.add(a.id, 2);
    await shop.cart.add(b.id);
    await shop.cart.add(b.id);
    runtime = await harness.reload(runtime);
    shop = createShopServices(runtime);
    expect(
      (await runtime.db.cartItems.where('customerId').equals('user_0003').toArray()).map(
        (l) => l.quantity
      )
    ).toEqual([2, 2]);

    const order = await shop.checkout.placeOrder(address);
    expect(order.status).toBe('placed');
    expect(order.subtotalCents).toBe(a.priceCents * 2 + b.priceCents * 2);
    expect(order.totalCents).toBe(order.subtotalCents + order.shippingCents + order.taxCents);
    expect(Number.isInteger(order.totalCents)).toBe(true);

    runtime = await harness.reload(runtime);
    expect((await runtime.db.products.get(a.id))?.stock).toBe(a.stock - 2);
    expect((await runtime.db.products.get(b.id))?.stock).toBe(b.stock - 2);
    expect(await runtime.db.orders.get(order.id)).toMatchObject({
      number: order.number,
      customerId: 'user_0003',
    });
    expect(await runtime.db.orderItems.where('orderId').equals(order.id).count()).toBe(2);
    expect(await runtime.db.cartItems.where('customerId').equals('user_0003').count()).toBe(0);
  });

  it('refuses insufficient stock and rolls back every earlier decrement', async () => {
    fresh();
    let runtime = await harness.boot('new-shopper');
    let shop = createShopServices(runtime);
    const [first, second] = await runtime.db.products.orderBy('id').limit(2).toArray();
    if (!first || !second) throw new Error('catalog');
    await shop.cart.add(first.id, 1);
    await shop.cart.add(second.id, 3);
    // Someone else buys the second product's stock while it sits in the cart.
    await runtime.db.products.update(second.id, { stock: 2 });
    const before = await snapshot(runtime.db);

    const error = await shop.checkout.placeOrder(address).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as InsufficientStockError).shortages).toEqual([
      { productId: second.id, name: second.name, requested: 3, available: 2 },
    ]);
    // The first line was decremented inside the transaction before the failure: rolled back.
    expect(await snapshot(runtime.db)).toEqual(before);

    runtime = await harness.reload(runtime);
    shop = createShopServices(runtime);
    expect(await snapshot(runtime.db)).toEqual(before);

    // Fix the cart, and the same checkout succeeds.
    await shop.cart.setQuantity(second.id, 2);
    await shop.checkout.placeOrder(address);
    expect((await runtime.db.products.get(second.id))?.stock).toBe(0);
    expect((await runtime.db.products.get(first.id))?.stock).toBe(first.stock - 1);
  });

  it('the low-stock scenario cart is refused at checkout with nothing written', async () => {
    fresh();
    const runtime = await harness.boot('low-stock');
    const shop = createShopServices(runtime);
    const before = await snapshot(runtime.db);
    await expect(shop.checkout.placeOrder(address)).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await snapshot(runtime.db)).toEqual(before);
  });

  it('offline checkout fails clearly and writes nothing', async () => {
    fresh();
    const runtime = await harness.boot('offline-checkout');
    const shop = createShopServices(runtime);
    expect(runtime.environmentState().network).toBe('offline');
    const before = await snapshot(runtime.db);
    expect(before.cart.length).toBeGreaterThan(0);
    const error = await shop.checkout.placeOrder(address).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SimulatedServiceError);
    expect((error as SimulatedServiceError).code).toBe('offline');
    expect(await snapshot(runtime.db)).toEqual(before);
  });

  it('validates checkout input and cart quantities against stock', async () => {
    fresh();
    const runtime = await harness.boot('new-shopper');
    const shop = createShopServices(runtime);
    const product = (await runtime.db.products.toArray())[0];
    if (!product) throw new Error('catalog');
    await expect(shop.checkout.placeOrder(address)).rejects.toMatchObject({
      issues: { cart: 'Your cart is empty.' },
    });
    await expect(
      shop.checkout.placeOrder({ ...address, email: 'nope', postalCode: '!', country: 'Atlantis' })
    ).rejects.toMatchObject({
      issues: {
        email: 'Enter a valid email',
        postalCode: 'Enter a valid postal code',
        country: 'Pick a country',
      },
    });
    await runtime.db.products.update(product.id, { stock: 3 });
    await expect(shop.cart.add(product.id, 4)).rejects.toBeInstanceOf(ValidationError);
    await shop.cart.add(product.id, 3);
    await expect(shop.cart.add(product.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('enforces roles in services: guests cannot shop, customers cannot edit products, admins can', async () => {
    fresh();
    const runtime = await harness.boot('returning-customer');
    const shop = createShopServices(runtime);
    const product = (await runtime.db.products.toArray())[0];
    if (!product) throw new Error('catalog');

    await expect(
      shop.products.update(product.id, { price: '1.00', compareAt: '', stock: '1' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await runtime.session.switchActor('user_0004');
    await expect(shop.cart.add(product.id)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(shop.checkout.placeOrder(address)).rejects.toBeInstanceOf(PermissionDeniedError);

    await runtime.session.switchActor('user_0002');
    await expect(
      shop.products.update(product.id, { price: 'free', compareAt: '', stock: '-1' })
    ).rejects.toMatchObject({
      issues: { price: expect.any(String), stock: 'Stock cannot be negative' },
    });
    await shop.products.update(product.id, { price: '12.50', compareAt: '20', stock: '7' });
    expect(await runtime.db.products.get(product.id)).toMatchObject({
      priceCents: 1250,
      compareAtCents: 2000,
      stock: 7,
    });
  });

  it('rejects a garbage "was" price and an empty stock instead of silently changing them', async () => {
    fresh();
    const runtime = await harness.boot('returning-customer');
    const shop = createShopServices(runtime);
    await runtime.session.switchActor('user_0002');
    const product = (await runtime.db.products.toArray()).find((p) => p.compareAtCents !== null);
    if (!product) throw new Error('seed has a product on sale');
    for (const compareAt of ['abc', '12.345', '-5']) {
      await expect(
        shop.products.update(product.id, { price: '12.50', compareAt, stock: '7' })
      ).rejects.toMatchObject({ issues: { compareAt: 'Enter a valid amount or leave empty' } });
    }
    for (const stock of ['', '   ', null, 'abc']) {
      await expect(
        shop.products.update(product.id, { price: '12.50', compareAt: '', stock })
      ).rejects.toMatchObject({ issues: { stock: 'Enter a whole number' } });
    }
    expect(await runtime.db.products.get(product.id)).toEqual(product);
  });

  it('two concurrent cancels restock only once', async () => {
    fresh();
    const runtime = await harness.boot('returning-customer');
    const shop = createShopServices(runtime);
    const order = (await runtime.db.orders.where('customerId').equals('user_0003').toArray()).find(
      (o) => o.status === 'placed' || o.status === 'processing'
    );
    if (!order) throw new Error('seed has an open order');
    const items = await runtime.db.orderItems.where('orderId').equals(order.id).toArray();
    const before = await runtime.db.products.bulkGet(items.map((i) => i.productId));
    const results = await Promise.allSettled([
      shop.orders.cancel(order.id),
      shop.orders.cancel(order.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const after = await runtime.db.products.bulkGet(items.map((i) => i.productId));
    items.forEach((item, i) => {
      expect(after[i]?.stock).toBe((before[i]?.stock ?? 0) + item.quantity);
    });
  });

  it('cancelling an order returns its items to stock', async () => {
    fresh();
    const runtime = await harness.boot('returning-customer');
    const shop = createShopServices(runtime);
    const order = (await runtime.db.orders.where('customerId').equals('user_0003').toArray()).find(
      (o) => o.status === 'placed' || o.status === 'processing'
    );
    if (!order) throw new Error('seed has an open order');
    const items = await runtime.db.orderItems.where('orderId').equals(order.id).toArray();
    const stockBefore = await runtime.db.products.bulkGet(items.map((i) => i.productId));
    await shop.orders.cancel(order.id);
    expect((await runtime.db.orders.get(order.id))?.status).toBe('cancelled');
    const stockAfter = await runtime.db.products.bulkGet(items.map((i) => i.productId));
    items.forEach((item, i) => {
      expect(stockAfter[i]?.stock).toBe((stockBefore[i]?.stock ?? 0) + item.quantity);
    });
    await expect(shop.orders.cancel(order.id)).rejects.toBeInstanceOf(ValidationError);
  });
});
