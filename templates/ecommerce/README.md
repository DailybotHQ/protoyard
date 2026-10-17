# Storefront

A working Protoyard template for commerce flows: a **storefront** plus an
**admin-lite** back office. Catalog, cart, checkout, orders and inventory all
persist in IndexedDB and run through simulated permissions and network.

> **Demo only.** There is no payment integration and the checkout has **no card
> fields** — a “Pay with demo wallet” button stands in for payment. Never enter
> real card data in a prototype.

```bash
pnpm protoyard new my-shop --template ecommerce
pnpm protoyard dev my-shop
```

## What works

- **Catalog** — 30 products in 5 categories; category chips, search, price range
  (validated dollar inputs + quick ranges), “in stock only”, five sorts. Low-stock and
  sold-out badges.
- **Product page** — quantity stepper bounded by stock (and what is already in the cart).
- **Cart** — per persona, persisted; quantity changes validated against stock; lines that
  now exceed stock are highlighted.
- **Checkout** — validated address form (inline errors), standard/express delivery,
  free standard shipping over $75, 8.25% simulated tax. `checkout.placeOrder` runs in
  **one Dexie transaction**: re-reads products, decrements stock, writes the order and its
  items and empties the cart. If any line lacks stock the transaction throws
  `InsufficientStockError` and **every** earlier write rolls back. Offline → a clear error
  and nothing is written.
- **Orders** — history (DataTable with status filter), order detail with a progress tracker,
  customer cancellation before shipping (returns items to stock atomically).
- **Admin** (owner/admin) — stock stats, product table with low/sold-out filters, edit
  price / “was” price / stock; all customers’ orders and status updates
  (placed → processing → shipped → delivered).

All money is **integer cents** (`priceCents: 2499`); `parseDollars()` converts form input
without floating-point math.

## Personas & scenarios

| Persona | Role | Can |
| --- | --- | --- |
| Ava Morales (`user_0001`) | owner | everything |
| Ben Carter (`user_0002`) | admin | everything (store admin) |
| Chloe Park (`user_0003`) | member | cart, checkout, own orders, cancel own unshipped orders |
| Guest visitor (`user_0004`) | viewer | browse only |

| Scenario | What you see |
| --- | --- |
| `new-shopper` | Chloe’s brand-new account: empty cart, no orders, full shelves |
| `returning-customer` *(default)* | Six past orders in every status, two items in the cart |
| `low-stock` | Half the catalog nearly gone, 5 sold out, one cart line exceeds stock → checkout refuses |
| `offline-checkout` | Network offline: checkout fails clearly, nothing written |
| `store-admin` | Same store as Ben, the admin |
| `guest-browsing` | Same store as a guest who cannot buy |

Scenarios are composed from `@protoyard/scenarios` presets in `src/scenarios/index.ts`;
generator knobs live in `generators.shop` (`customerOrders`, `cartLines`,
`otherCustomers`, `lowStockShare`, `soldOut`, `cartOverStock`).

## Layout

```text
src/database/schema.ts     categories, products, cartItems, orders, orderItems
src/domain/policy.ts       roles → capabilities (+ "own order" rules)
src/domain/services.ts     cart, checkout (atomic), orders, products — assert → zod → environment.run → transaction
src/domain/catalog.ts      pure money/pricing/filter helpers
src/scenarios/             scenarios (presets) + deterministic generator
src/screens/               Shop, ProductDetail, Cart, Checkout, Orders, OrderDetail, Admin
tests/                     generator determinism/integrity + checkout atomicity on the real runtime
```

## Checks

```bash
pnpm vitest run templates/ecommerce
pnpm --filter @protoyard-template/ecommerce typecheck
pnpm --filter @protoyard-template/ecommerce build
```
