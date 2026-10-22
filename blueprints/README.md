# Marketplace blueprint catalog

Data-only blueprints. The flat `*.json` files in this folder are the app
marketplace, indexed by `protoyard index` as `kind: blueprint`. Deck, page and
doc examples live in their own folders (see [Choose an example by
kind](#choose-an-example-by-kind)). Each app file is a full [blueprint](../packages/blueprint/README.md)
with a required **brand** and **catalog** block so the gallery can list it and
`protoyard generate <slug> --blueprint blueprints/<name>.json` can create an
on-brand prototype. The catalog spans four or more related entities per
blueprint, scenario distribution hints (enum weights, date windows and numeric
trends), a dashboard, and at least one domain-specific board, calendar,
timeline, map or analytics screen. The catalog test checks that every supported
screen kind is represented in at least three blueprints and dry-runs generation
for every file.

Fictional data only (`.example` domains via generator fakes). Blueprints are
never bundled into a running prototype’s JS — they are source for generate.

## Choose an example by kind

A blueprint has a `kind` (ADR-036): `app` (the default, used when `kind` is
missing), `deck`, `page` or `doc`. Each kind keeps its examples in its own
catalog, so an agent can pick a starting point without mixing apps and content.

| Kind | Catalog | Examples | Start from it when |
| --- | --- | --- | --- |
| `app` | [Marketplace catalog](#catalog) (`blueprints/*.json`) and [quick examples](./quick/README.md) (`blueprints/quick/`) | 40 + 4 | The idea is a product with data: entities, roles, screens and scenarios |
| `deck` | [Deck examples](./decks/README.md) (`blueprints/decks/`) | 5 | The idea is a presentation: a pitch, review, launch or training (plus a minimal visual-QA deck) |
| `page` | [Page examples](./pages/README.md) (`blueprints/pages/`) | 1 | The idea is a single scrolling marketing or waitlist page |
| `doc` | [Doc examples](./docs/README.md) (`blueprints/docs/`) | 1 | The idea is a report, one-pager or data story to read and print |

Content kinds (`deck`, `page`, `doc`) have no entities, roles or screens. They
are built from the shared blocks in `@protoyard/blocks`; a deck adds slide
layouts from `@protoyard/decks/layouts`.

### Deterministic authoring workflow

1. **Pick the kind and the closest example.** Use the table above. Each kind
   catalog explains its shape and lists what every example shows.
2. **Draft from a brief, offline.** `blueprintFromBrief(brief, { kind })` in
   `@protoyard/blueprint` detects the kind from the brief, or takes it
   explicitly, and returns a draft that is the same for the same brief.
   - Decks pick one of eight outlines: pitch, qbr, launch, status, training,
     lesson, report, talk. Layouts are then selected from each slide's role.
   - Pages use landing, pricing, waitlist or generic; docs use report,
     handbook, one-pager, proposal or generic.
   - Drafts are placeholder scaffolding, never research.

   The `protoyard blueprint new --from-brief` command creates app blueprints
   only; for a content brief it stops with a message naming the detected kind.
3. **Write or edit the JSON** against the shape in the kind catalog. Copy an
   example rather than starting from a blank file.
4. **Validate.** `pnpm protoyard blueprint validate <file>` checks any kind
   and prints a kind-specific summary, for example "a valid deck blueprint: 6
   slides". In code, `safeParseAnyBlueprint` and
   `validateBlueprintForAuthoring` return issues with JSON paths. For a deck,
   `checkDeckStatic` from `@protoyard/decks/quality` adds the deck quality
   rules (notes, layout repetition, word density, image alt and size, step
   order).
5. **Run the catalog tests** for the kind you touched (commands below).

### What works today for each kind

| | `app` | `deck`, `page`, `doc` |
| --- | --- | --- |
| `protoyard blueprint validate` | Yes | Yes |
| `protoyard generate --blueprint` | Yes | Not yet: it accepts app blueprints only |
| `protoyard blueprint new --from-brief` | Yes | Not yet: use `blueprintFromBrief(brief, { kind })` |
| `protoyard index` and `protoyard list` | Yes (every flat `blueprints/*.json` file) | The kind folders are scanned, but an entry is listed only with a `catalog` block. The current examples have none, so `protoyard index` reports them as invalid and they are not listed in the registry or the gallery. |

```bash
pnpm protoyard blueprint validate blueprints/decks/northwind-qbr.json
pnpm vitest run packages/blueprint/tests/deck-catalog.test.ts
pnpm vitest run packages/blueprint/tests/page-doc-catalog.test.ts
pnpm vitest run packages/blueprint/tests/catalog-docs.test.ts
```

## Quick examples

Small archetype starters live separately from the marketplace catalog. They
use deterministic fake generation, explicit starter routes and only their
declared lazy kit families; they are intentionally compact for idea validation.

| Blueprint | Archetype | Entities | First-run focus |
| --- | --- | --- | --- |
| [Quick Assistant Workspace](./quick/assistant.json) | assistant | conversations, messages | inspect and continue a simulated assistant conversation |
| [Quick Team Chat](./quick/team-chat.json) | team-chat | rooms, members, messages | explore fictional rooms, members and message history |
| [Quick Workspace Onboarding](./quick/saas-onboarding.json) | saas-onboarding | workspaces, teammates | create a workspace and invite a teammate (simulated sign-in, invitations and plans) |
| [Quick Product Analytics](./quick/analytics.json) | analytics | events, metrics | read a deterministic dashboard, explore events by channel, record a metric |

See the [quick blueprint catalog](./quick/README.md) for supported kit entry points,
selection criteria, derived route and source-byte scope, and each example's validation exercise.

These files are source blueprints, not marketplace listings. Their generated
content is deterministic and fictional; the assistant uses a local simulation,
not a hosted model. The SaaS and analytics examples carry `validation.tasks`
(each one a route and/or a `count>=` predicate) so an exploration starts with
tasks to try; their sign-in, invitations, plans and events are simulated, with
no credentials or provider. Validate the examples with
`pnpm vitest run packages/blueprint/tests/quick-examples/assistant-chat.test.ts` and
`pnpm vitest run packages/blueprint/tests/quick-examples/saas-analytics.test.ts`.

## Catalog

The catalog contains 40 blueprints across operations, services, business, people, content, and other product areas. The gallery count is derived from the indexed blueprint registry.

| Blueprint | Category | Screens |
| --- | --- | --- |
| [Fieldnote Farm Operations](./agriculture-farm-ops.json) | operations | dashboard, list, form, map, analytics, settings |
| [Signalboard Analytics](./analytics-workspace.json) | analytics | dashboard, list, form, analytics, detail, settings |
| [Hirepath ATS](./ats-recruiting.json) | hr | dashboard, list, form, board, detail, settings |
| [Calendar Booking](./booking-scheduling.json) | operations | dashboard, list, form, calendar, detail, settings |
| [Switchback Car Rental](./car-rental.json) | travel | dashboard, list, form, calendar, map, settings |
| [Harbor Clinic](./clinic.json) | health | dashboard, list, form, calendar, detail, settings |
| [Quill CMS](./cms-blog.json) | media | dashboard, list, form, analytics, detail, settings |
| [Stonepath Construction](./construction-projects.json) | operations | dashboard, list, form, timeline, settings |
| [Commonroom Workspaces](./coworking-spaces.json) | real-estate | dashboard, list, form, calendar, map, settings |
| [Northstar CRM](./crm.json) | sales | dashboard, list, form, analytics, detail, settings |
| [Harborlight Customer Success](./customer-success-health.json) | support | dashboard, list, form, board, settings |
| [Gatepass Events](./events-ticketing.json) | media | dashboard, list, form, calendar, detail, settings |
| [Waymark Field Service](./field-service-dispatch.json) | operations | dashboard, list, form, map, calendar, settings |
| [Stride Fitness](./fitness-mobile.json) | health | dashboard, list, form, timeline, detail, settings |
| [Northstar Fleet Care](./fleet-maintenance.json) | operations | dashboard, list, form, calendar, settings |
| [Dashdish Delivery Ops](./food-delivery.json) | commerce | dashboard, list, form, map, board, settings |
| [Openfield Grant Desk](./grant-management.json) | finance | dashboard, list, form, board, settings |
| [Signalpath Incident Desk](./incident-management.json) | developer-tools | dashboard, list, form, timeline, board, settings |
| [Brightcover Claims](./insurance-claims.json) | finance | dashboard, list, form, board, settings |
| [Stockroom Inventory](./inventory.json) | operations | dashboard, list, form, timeline, detail, settings |
| [Fleetpulse IoT](./iot-fleet.json) | operations | dashboard, list, form, map, detail, settings |
| [Casebook Legal](./legal-matters.json) | internal-tools | dashboard, list, form, timeline, detail, settings |
| [Campus LMS](./lms.json) | education | dashboard, list, form, board, detail, settings |
| [Routeline Logistics](./logistics.json) | operations | dashboard, list, form, map, detail, settings |
| [Forgewell Manufacturing](./manufacturing-work-orders.json) | operations | dashboard, list, form, board, analytics, settings |
| [Lumen Campaign Studio](./marketing-campaigns.json) | marketing | dashboard, list, form, calendar, analytics, settings |
| [Morrow Museum Catalog](./museum-collections.json) | media | dashboard, list, form, detail, board, settings |
| [Kindling Donors](./nonprofit-donors.json) | finance | dashboard, list, form, map, detail, settings |
| [Northstar Goals](./okr-goals.json) | productivity | dashboard, list, form, analytics, settings |
| [Ledgerly Finance](./personal-finance.json) | finance | dashboard, list, form, analytics, detail, settings |
| [Tandem Podcast Studio](./podcast-studio.json) | media | dashboard, list, form, calendar, settings |
| [Launchpad Projects](./project-management.json) | productivity | dashboard, list, form, board, detail, settings |
| [Lotline Realty](./real-estate.json) | real-estate | dashboard, list, form, map, detail, settings |
| [Tablefire POS](./restaurant-pos.json) | commerce | dashboard, list, form, board, detail, settings |
| [Juniper Salon Studio](./salon-booking.json) | operations | dashboard, list, form, calendar, settings |
| [Neighborhood Feed](./social-feed.json) | social | dashboard, list, form, board, detail, settings |
| [Waypoint Travel](./travel-booking.json) | travel | dashboard, list, form, calendar, detail, settings |
| [Gridline Utility Ops](./utility-outages.json) | operations | dashboard, list, form, map, timeline, settings |
| [Pinecone Veterinary Care](./veterinary-clinic.json) | health | dashboard, list, form, calendar, detail, settings |
| [Stackline Warehouse](./warehouse-wms.json) | operations | dashboard, list, form, map, settings |

Blueprint notification rules currently apply to all matching writes. They do
not yet support per-persona notification preferences that mute selected rules;
there are no per-rule preference switches in generated Settings screens.

```bash
pnpm protoyard list --kind blueprint
pnpm protoyard generate my-crm --blueprint blueprints/crm.json
pnpm vitest run packages/blueprint/tests/catalog.test.ts
```
