# Marketplace template

A two-sided starter for a small independent marketplace. Buyers can browse
listings and try a simulated checkout. Sellers can complete a setup wizard,
publish and manage listings, review orders, and see pending payout amounts.

## Start a marketplace prototype

```bash
pnpm protoyard new my-market --template marketplace
pnpm protoyard dev my-market
```

The default scenario starts signed out and includes sample listings, a buyer,
sellers, and a simulated Google SSO route. Sign in or create an account to try
checkout and seller tools. The SaaS kit also provides onboarding, inbox,
workspace, profile/settings, and subscription billing screens.

## Scenarios

- `marketplace` — signed-out visitor and public sample catalog.
- `seller-onboarding` — buyer can complete the shop and fictional payout-contact wizard.
- `seller-active` — seller studio with active listings.
- `seller-orders` — seller has a completed sample order and pending payout.

Listings and orders persist in IndexedDB. A successful simulated checkout
creates an order, a pending payout in integer cents, and buyer/seller inbox
notices in one transaction. The seller share is 85% of the order total; the
remainder is a simulated platform fee. Declined checkouts create an order with
no payout. Removing a listing with order history archives it so the order
remains referentially intact.

## Simulation boundary

Accounts, SSO, billing, checkout, and payouts are local demonstrations only.
No provider, payment processor, bank, or email service is contacted. Use only
fictional `@example.com` addresses. Simulated role checks are UX controls, not
security.

## Extend it

Start with `src/database/schema.ts`, then update capabilities and record rules
in `src/domain/policy.ts`. Domain mutations live in `src/domain/services.ts`;
they validate inputs and write through the simulated environment and database
transactions. Scenarios and generated sample rows live in `src/scenarios/`.
