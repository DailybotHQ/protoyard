# Marketplace: spec

## Problem

TODO: the product problem in two or three sentences.

The `marketplace` template you started from: A two-sided marketplace starter with seller onboarding, listing management, simulated checkout, orders, and cent-based payouts.

## Users

TODO: who uses it, mapped to the roles in [PERMISSIONS.md](PERMISSIONS.md).

## Capabilities

TODO: what a user can do, one line each, linked to [FLOWS.md](FLOWS.md).

## Non-goals

TODO: what this prototype deliberately does not do.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `marketplace` | Marketplace browse | Lifecycle | sparse | 84001 | `{"saas":{"oauthLinked":["google"],"signedOut":true}}` | A signed-out visitor explores active listings and can use the simulated account flows. |
| `seller-active` | Seller workspace | Lifecycle | normal | 84003 | — | An active seller manages listings and reviews marketplace orders. |
| `seller-onboarding` | New seller setup | Lifecycle | sparse | 84002 | — | A buyer account is ready to complete the seller store and payout setup wizard. |
| `seller-orders` | Buyer and seller orders | Lifecycle | normal | 84004 | — | A seller has a paid marketplace order and a pending simulated payout. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.marketplace` |
| slug | `marketplace` |
| name | Marketplace |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `marketplace` |
| default theme | `violet` |
| storage namespace | `template-marketplace` |
| schema version | 1 |
| generator version | 1 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
