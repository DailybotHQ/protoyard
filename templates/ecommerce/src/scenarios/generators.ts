import {
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  type Organization,
  type Persona,
  type Row,
  type WorldSeed,
} from '@protoyard/core';
import type {
  CartItem,
  Category,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ShippingMethod,
} from '../database/schema.ts';
import { computeTotals } from '../domain/catalog.ts';
import type { ShopGeneratorOptions } from './index.ts';

/**
 * Deterministic store builder. Order matters for determinism and integrity:
 * organization → people → categories → products → orders → cart. Randomness
 * comes only from `ctx.rng` / `ctx.faker` and dates only from `ctx.time`.
 */

/** Bump when the same seed can produce a different world. */
export const SHOP_GENERATOR_VERSION = 1;

export const FEATURED_CUSTOMER_ID = 'user_0003';

/** Fixed cast: `?actor=user_0002` always means Ben, the store admin. */
const CAST = [
  { id: 'user_0001', name: 'Ava Morales', title: 'Founder', role: 'owner', joinedDaysAgo: 400 },
  {
    id: 'user_0002',
    name: 'Ben Carter',
    title: 'Store manager',
    role: 'admin',
    joinedDaysAgo: 380,
  },
  { id: 'user_0003', name: 'Chloe Park', title: 'Customer', role: 'member', joinedDaysAgo: 240 },
  {
    id: 'user_0004',
    name: 'Guest visitor',
    title: 'Not signed in',
    role: 'viewer',
    joinedDaysAgo: 0,
  },
] as const;

const CATEGORIES: readonly Omit<Category, 'id'>[] = [
  { name: 'Bags', slug: 'bags', description: 'Carry-alls built to last a decade.' },
  { name: 'Stationery', slug: 'stationery', description: 'Notebooks, pens and desk companions.' },
  { name: 'Home', slug: 'home', description: 'Small things that make a home calmer.' },
  { name: 'Outdoors', slug: 'outdoors', description: 'Gear for weekends away.' },
  { name: 'Tech', slug: 'tech', description: 'Accessories for the devices you already own.' },
];

/** [name, category slug, base price in cents, description] */
const PRODUCTS: readonly (readonly [string, string, number, string])[] = [
  [
    'Waxed Canvas Tote',
    'bags',
    6800,
    'Water-resistant waxed canvas with leather handles and an inner zip pocket.',
  ],
  [
    'Everyday Backpack 22L',
    'bags',
    12900,
    'Padded laptop sleeve, luggage pass-through and a weatherproof base.',
  ],
  ['Mini Crossbody', 'bags', 4500, 'Fits a phone, keys and a card wallet. Adjustable strap.'],
  ['Weekender Duffel', 'bags', 16500, 'A two-night bag with a separate shoe compartment.'],
  ['Packable Daypack', 'bags', 3900, 'Folds into its own pocket; 18 liters when open.'],
  [
    'Dot Grid Notebook A5',
    'stationery',
    1800,
    '192 pages of 100 gsm paper that handles fountain pens.',
  ],
  [
    'Brass Ballpoint Pen',
    'stationery',
    3200,
    'Solid brass body that patinas with use. Refillable.',
  ],
  [
    'Weekly Desk Planner',
    'stationery',
    2400,
    'Undated tear-off sheets for planning a week at a glance.',
  ],
  ['Linen Sketchbook', 'stationery', 2200, 'Lay-flat binding and toothy paper for pencil and ink.'],
  ['Fineliner Set (6)', 'stationery', 1500, 'Archival pigment ink in six everyday colors.'],
  ['Walnut Desk Tray', 'stationery', 3800, 'Solid walnut tray for pens, cards and small notes.'],
  ['Stoneware Mug', 'home', 2600, 'Hand-glazed 12 oz mug; dishwasher and microwave safe.'],
  ['Pour-over Coffee Set', 'home', 5400, 'Ceramic dripper, glass carafe and 40 paper filters.'],
  ['Linen Throw Blanket', 'home', 8900, 'Stone-washed linen, soft from the first night.'],
  ['Soy Candle — Cedar', 'home', 2900, 'Fifty hours of cedar and smoke from a cotton wick.'],
  [
    'Cotton Waffle Towel',
    'home',
    3400,
    'Quick-drying waffle weave that gets softer with every wash.',
  ],
  ['Ceramic Planter', 'home', 3600, 'Matte planter with a drainage hole and cork saucer.'],
  ['Enamel Camp Mug', 'outdoors', 1900, 'Steel enamel mug that goes straight onto the stove.'],
  ['Insulated Bottle 750 ml', 'outdoors', 3500, 'Keeps drinks cold for 24 hours and hot for 12.'],
  ['Merino Beanie', 'outdoors', 3200, 'Itch-free merino rib knit for cold mornings.'],
  ['Trail First-Aid Kit', 'outdoors', 2800, 'Compact kit with the essentials for a day hike.'],
  ['Folding Camp Stool', 'outdoors', 4200, 'Aluminum frame, holds 110 kg, folds to 30 cm.'],
  ['Headlamp 300 lm', 'outdoors', 3900, 'USB-C rechargeable with a red night mode.'],
  ['Braided USB-C Cable 2 m', 'tech', 1900, 'Reinforced braided cable rated for 100 W charging.'],
  ['Wool Laptop Sleeve 14"', 'tech', 4900, 'Felted wool sleeve with a leather pull tab.'],
  ['Wireless Charging Pad', 'tech', 3900, 'Charges phones and earbuds through most cases.'],
  ['Cable Organizer Roll', 'tech', 2400, 'Canvas roll with elastic loops for cables and chargers.'],
  ['Aluminum Laptop Stand', 'tech', 5900, 'Raises your screen to eye level; folds flat.'],
  ['Noise-Isolating Earbuds', 'tech', 7900, 'Wired earbuds with an inline microphone.'],
  ['Desk Mat — Felt', 'tech', 3100, 'A soft felt surface for keyboard and mouse.'],
];

const STREETS = ['Maple Ave', 'Harbor St', 'Juniper Rd', 'Elm Street', 'Lakeview Dr', 'Cedar Ln'];

function options(ctx: GenerateContext): ShopGeneratorOptions {
  const raw = (ctx.scenario.generators.shop ?? {}) as Partial<ShopGeneratorOptions>;
  return {
    customerOrders: Math.max(0, raw.customerOrders ?? 4),
    cartLines: Math.max(0, Math.min(5, raw.cartLines ?? 0)),
    otherCustomers: Math.max(0, Math.min(30, raw.otherCustomers ?? 6)),
    lowStockShare: Math.max(0, Math.min(1, raw.lowStockShare ?? 0.1)),
    soldOut: Math.max(0, Math.min(10, raw.soldOut ?? 0)),
    cartOverStock: raw.cartOverStock ?? false,
  };
}

export function generateShopWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, rng, faker, ids, time } = ctx;
  const opts = options(ctx);
  const now = time.now;
  const orgAge = scenario.organization.ageDays;
  const orgCreated = time.daysAgo(orgAge);
  const iso = (d: Date) => time.iso(d);
  const between = (from: Date, to: Date) => {
    const lo = Math.max(from.getTime(), orgCreated.getTime());
    const hi = Math.min(to.getTime(), now.getTime());
    return new Date(hi <= lo ? hi : lo + rng.next() * (hi - lo));
  };

  // ── Organization & people ───────────────────────────────────────────────
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Fieldnote Supply',
    type: 'company',
    plan: 'pro',
    billingStatus: 'active',
    createdAt: iso(orgCreated),
    size: CAST.length + opts.otherCustomers,
    featureFlags: { ...scenario.organization.featureFlags },
  };
  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  const addPerson = (p: {
    id: string;
    name: string;
    title: string;
    role: string;
    joinedDaysAgo: number;
  }) => {
    const isActor = p.id === scenario.actor.id;
    const days = Math.min(orgAge, isActor ? scenario.actor.joinedDaysAgo : p.joinedDaysAgo);
    const joinedAt = iso(time.daysAgo(days));
    const role = isActor ? scenario.actor.role : p.role;
    personas.push({
      id: p.id,
      name: p.name,
      email: `${p.name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
      title: p.title,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt,
      onboardingComplete: true,
      preferences: {},
      summary: `${p.title}${role === 'member' ? `, customer for ${days} days` : ''}`,
    });
    memberships.push({
      id: `member_${p.id}`,
      personaId: p.id,
      organizationId: organization.id,
      role,
      joinedAt,
      capabilities: [],
    });
  };
  for (const member of CAST) addPerson(member);
  const others: string[] = [];
  for (let i = 0; i < opts.otherCustomers; i++) {
    const id = ids.next('customer');
    others.push(id);
    addPerson({
      id,
      name: faker.person.fullName(),
      title: 'Customer',
      role: 'member',
      joinedDaysAgo: rng.int(5, Math.max(5, orgAge - 1)),
    });
  }
  const joined = new Map(personas.map((p) => [p.id, new Date(p.joinedAt)]));

  // ── Catalog ─────────────────────────────────────────────────────────────
  const categories: Category[] = CATEGORIES.map((c) => ({ id: ids.next('category'), ...c }));
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const ranks = rng.shuffle(PRODUCTS.map((_, i) => i));
  const products: Product[] = PRODUCTS.map(([name, slug, price, description], i) => {
    const created = between(orgCreated, time.daysAgo(Math.min(orgAge, 30)));
    const onSale = rng.chance(0.2);
    return {
      id: ids.next('product'),
      name,
      categoryId: categoryBySlug.get(slug) ?? categories[0]?.id ?? '',
      description,
      priceCents: price,
      compareAtCents: onSale ? Math.round((price * 1.25) / 100) * 100 : null,
      stock: rng.int(12, 60),
      rating: Math.round(rng.float(3.6, 5) * 10) / 10,
      reviewCount: rng.int(3, 240),
      hue: (i * 47 + rng.int(0, 20)) % 360,
      featuredRank: ranks[i] ?? i,
      createdAt: iso(created),
      updatedAt: iso(created),
    };
  });
  // Scarcity is applied after the base catalog so it never shifts other values.
  const scarcity = rng.fork('scarcity');
  const order = scarcity.shuffle(products.map((_, i) => i));
  order.slice(0, opts.soldOut).forEach((index) => {
    const product = products[index];
    if (product) product.stock = 0;
  });
  order
    .slice(opts.soldOut, opts.soldOut + Math.round(products.length * opts.lowStockShare))
    .forEach((index) => {
      const product = products[index];
      if (product) product.stock = scarcity.int(1, 5);
    });

  // ── Orders ──────────────────────────────────────────────────────────────
  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  let orderNumber = 10_000;
  const makeOrder = (customerId: string, placedAt: Date) => {
    const persona = personas.find((p) => p.id === customerId);
    const ageDays = (now.getTime() - placedAt.getTime()) / MS_PER_DAY;
    const status: OrderStatus =
      ageDays > 10
        ? rng.chance(0.08)
          ? 'cancelled'
          : 'delivered'
        : ageDays > 4
          ? 'shipped'
          : ageDays > 1
            ? 'processing'
            : 'placed';
    const method: ShippingMethod = rng.chance(0.25) ? 'express' : 'standard';
    const id = ids.next('order');
    const items = rng.sample(products, rng.int(1, 3)).map((product) => ({
      id: ids.next('item'),
      orderId: id,
      productId: product.id,
      name: product.name,
      unitPriceCents: product.priceCents,
      quantity: rng.weighted([
        [1, 6],
        [2, 2],
        [3, 1],
      ]),
    }));
    orderNumber += 1;
    const updated = new Date(
      Math.min(now.getTime(), placedAt.getTime() + Math.min(ageDays, 6) * MS_PER_DAY * 0.8)
    );
    orders.push({
      id,
      number: `FS-${orderNumber}`,
      customerId,
      status,
      shippingMethod: method,
      shipping: {
        fullName: persona?.name ?? 'Customer',
        email: persona?.email ?? 'customer@example.com',
        address: `${rng.int(10, 990)} ${rng.pick(STREETS)}`,
        city: rng.pick(['Portland', 'Austin', 'Denver', 'Toronto', 'Bogotá', 'Madrid']),
        postalCode: String(rng.int(10_000, 99_999)),
        country: 'United States',
      },
      ...computeTotals(items, method),
      placedAt: iso(placedAt),
      updatedAt: iso(status === 'placed' ? placedAt : updated),
    });
    orderItems.push(...items);
  };

  const placements: { customerId: string; at: Date }[] = [];
  const chloeJoined = joined.get(FEATURED_CUSTOMER_ID) ?? orgCreated;
  for (let i = 0; i < opts.customerOrders; i++) {
    // Spread across tenure; the most recent one is fresh so every status shows up.
    const at =
      i === 0 ? new Date(now.getTime() - rng.int(2, 20) * 3_600_000) : between(chloeJoined, now);
    placements.push({ customerId: FEATURED_CUSTOMER_ID, at: at < chloeJoined ? chloeJoined : at });
  }
  for (const customerId of others) {
    for (let i = 0, n = rng.int(1, 3); i < n; i++) {
      placements.push({ customerId, at: between(joined.get(customerId) ?? orgCreated, now) });
    }
  }
  // Order numbers increase with time, like a real store.
  placements.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const p of placements) makeOrder(p.customerId, p.at);

  // ── Chloe's cart ────────────────────────────────────────────────────────
  const cartItems: CartItem[] = [];
  const available = products.filter((p) => p.stock > 0);
  const lowStock = available.filter((p) => p.stock <= 5);
  const picks = rng.sample(available, opts.cartLines);
  if (opts.cartOverStock && lowStock[0] && !picks.includes(lowStock[0])) picks[0] = lowStock[0];
  picks.forEach((product, index) => {
    const overStock = opts.cartOverStock && index === 0;
    cartItems.push({
      id: `${FEATURED_CUSTOMER_ID}:${product.id}`,
      customerId: FEATURED_CUSTOMER_ID,
      productId: product.id,
      quantity: overStock ? product.stock + 1 : Math.min(product.stock, rng.int(1, 2)),
      addedAt: iso(between(time.daysAgo(3), now)),
    });
  });

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: {
      categories: categories as unknown as Row[],
      products: products as unknown as Row[],
      orders: orders as unknown as Row[],
      orderItems: orderItems as unknown as Row[],
      cartItems: cartItems as unknown as Row[],
    },
  };
}
