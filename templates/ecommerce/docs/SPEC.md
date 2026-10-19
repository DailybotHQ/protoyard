# Storefront: spec

## Problem

TODO: the product problem in two or three sentences.

The `ecommerce` template you started from: A storefront with admin-lite: catalog with categories, search and filters, product pages, a persisted cart, a demo-only checkout that places orders atomically against inventory, order history and price/stock editing for admins.

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
| `guest-browsing` | Guest browsing | Roles | normal | 5150 | `{"shop":{"cartLines":2,"cartOverStock":false,"customerOrders":6,"lowStockShare":0.1,"otherCustomers":8,"soldOut":1}}` | A visitor who has not signed in: can browse and search, but not add to cart or check out. |
| `low-stock` | Low stock & sold out | Inventory | normal | 5150 | `{"shop":{"cartLines":2,"cartOverStock":true,"customerOrders":6,"lowStockShare":0.5,"otherCustomers":8,"soldOut":5}}` | Half the catalog is almost gone, five items are sold out and one cart line now exceeds what is left — checkout must refuse it. |
| `new-shopper` | New shopper | Customers | normal | 5150 | `{"shop":{"cartLines":0,"cartOverStock":false,"customerOrders":0,"lowStockShare":0,"otherCustomers":8,"soldOut":0}}` | Chloe just created an account: empty cart, no order history, fully stocked shelves. |
| `offline-checkout` | Offline checkout failure | Conditions | normal | 5150 | `{"shop":{"cartLines":2,"cartOverStock":false,"customerOrders":6,"lowStockShare":0.1,"otherCustomers":8,"soldOut":1}}` | The network is down: browsing works from local data, but checkout fails with a clear error and nothing is written. |
| `returning-customer` | Returning customer | Customers | normal | 5150 | `{"shop":{"cartLines":2,"cartOverStock":false,"customerOrders":6,"lowStockShare":0.1,"otherCustomers":8,"soldOut":1}}` | Chloe has shopped here for eight months: six past orders in every status and two items waiting in her cart. |
| `store-admin` | Store admin | Roles | normal | 5150 | `{"shop":{"cartLines":2,"cartOverStock":false,"customerOrders":6,"lowStockShare":0.1,"otherCustomers":8,"soldOut":1}}` | Ben manages the store: every customer’s orders, order status and price/stock editing. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.ecommerce` |
| slug | `ecommerce` |
| name | Storefront |
| version | 0.1.0 |
| platform | responsive |
| category | commerce |
| default scenario | `returning-customer` |
| default theme | `violet` |
| storage namespace | `template-ecommerce` |
| schema version | 1 |
| generator version | 2 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
