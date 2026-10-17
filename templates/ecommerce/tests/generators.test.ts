import type { WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type { CartItem, Order, OrderItem, Product } from '../src/database/schema.ts';
import { computeTotals, filterProducts, parseDollars } from '../src/domain/catalog.ts';
import { definition } from '../src/prototype.ts';
import { FEATURED_CUSTOMER_ID, generateShopWorld } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const rows = <T>(world: WorldSeed, table: string) => (world.tables[table] ?? []) as unknown as T[];

describe('ecommerce generator', () => {
  it('is deterministic for the same seed and differs for another seed', () => {
    const a = generateShopWorld(contextFor('returning-customer'));
    expect(generateShopWorld(contextFor('returning-customer'))).toEqual(a);
    const b = generateShopWorld(contextFor('returning-customer', 7));
    expect(b.tables.orders).not.toEqual(a.tables.orders);
  });

  it('passes the integrity rules and keeps money in integer cents', () => {
    for (const input of definition.scenarios) {
      const ctx = contextFor(input.id);
      const world = generateShopWorld(ctx);
      expect(
        validateWorld(world, {
          ...definition.integrity,
          referenceTime: ctx.scenario.referenceTime,
        }),
        input.id
      ).toEqual([]);
      expect(world.memberships.find((m) => m.personaId === ctx.scenario.actor.id)?.role).toBe(
        ctx.scenario.actor.role
      );
      for (const product of rows<Product>(world, 'products')) {
        expect(Number.isInteger(product.priceCents)).toBe(true);
        expect(product.stock).toBeGreaterThanOrEqual(0);
        if (product.compareAtCents !== null)
          expect(product.compareAtCents).toBeGreaterThan(product.priceCents);
      }
      const items = rows<OrderItem>(world, 'orderItems');
      for (const order of rows<Order>(world, 'orders')) {
        const lines = items.filter((i) => i.orderId === order.id);
        expect(lines.length).toBeGreaterThan(0);
        const totals = computeTotals(lines, order.shippingMethod);
        expect(order).toMatchObject(totals);
        expect(Number.isInteger(order.totalCents)).toBe(true);
      }
      const numbers = rows<Order>(world, 'orders').map((o) => o.number);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });

  it('shapes each scenario', () => {
    const fresh = generateShopWorld(contextFor('new-shopper'));
    expect(
      rows<Order>(fresh, 'orders').filter((o) => o.customerId === FEATURED_CUSTOMER_ID)
    ).toHaveLength(0);
    expect(rows(fresh, 'cartItems')).toHaveLength(0);
    expect(rows<Product>(fresh, 'products').every((p) => p.stock > 5)).toBe(true);

    const returning = generateShopWorld(contextFor('returning-customer'));
    const mine = rows<Order>(returning, 'orders').filter(
      (o) => o.customerId === FEATURED_CUSTOMER_ID
    );
    expect(mine).toHaveLength(6);
    expect(new Set(mine.map((o) => o.status)).size).toBeGreaterThanOrEqual(3);
    expect(rows(returning, 'cartItems')).toHaveLength(2);

    const low = generateShopWorld(contextFor('low-stock'));
    const products = rows<Product>(low, 'products');
    expect(products.filter((p) => p.stock === 0)).toHaveLength(5);
    expect(products.filter((p) => p.stock > 0 && p.stock <= 5).length).toBeGreaterThanOrEqual(10);
    const over = rows<CartItem>(low, 'cartItems').filter(
      (line) => line.quantity > (products.find((p) => p.id === line.productId)?.stock ?? 0)
    );
    expect(over).toHaveLength(1);

    // Role scenarios reuse the returning-customer world exactly.
    expect(generateShopWorld(contextFor('store-admin')).tables).toEqual(returning.tables);
    expect(generateShopWorld(contextFor('guest-browsing')).tables).toEqual(returning.tables);
  });
});

describe('catalog helpers', () => {
  it('parses dollar input into cents without floats', () => {
    expect(parseDollars('24.99')).toBe(2499);
    expect(parseDollars('$1,024.5')).toBe(102_450);
    expect(parseDollars('0.1')).toBe(10);
    expect(parseDollars('abc')).toBeNull();
    expect(parseDollars('1.999')).toBeNull();
  });

  it('computes totals with free standard shipping over the threshold', () => {
    expect(computeTotals([{ unitPriceCents: 2000, quantity: 2 }], 'standard')).toEqual({
      subtotalCents: 4000,
      shippingCents: 599,
      taxCents: 330,
      totalCents: 4929,
      itemCount: 2,
    });
    expect(computeTotals([{ unitPriceCents: 8000, quantity: 1 }], 'standard').shippingCents).toBe(
      0
    );
    expect(computeTotals([{ unitPriceCents: 8000, quantity: 1 }], 'express').shippingCents).toBe(
      1499
    );
    expect(computeTotals([], 'express').totalCents).toBe(0);
  });

  it('filters by query, category, price range and stock, then sorts', () => {
    const world = generateShopWorld(contextFor('low-stock'));
    const products = rows<Product>(world, 'products');
    const cheap = filterProducts(products, { maxCents: 2500, sort: 'price-asc' });
    expect(cheap.every((p) => p.priceCents <= 2500)).toBe(true);
    expect(cheap.map((p) => p.priceCents)).toEqual(
      [...cheap.map((p) => p.priceCents)].sort((a, b) => a - b)
    );
    expect(filterProducts(products, { inStockOnly: true }).every((p) => p.stock > 0)).toBe(true);
    expect(
      filterProducts(products, { query: 'MUG' })
        .map((p) => p.name)
        .sort()
    ).toEqual(['Enamel Camp Mug', 'Stoneware Mug']);
  });
});
