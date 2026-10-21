# Marketplace blueprint catalog

Data-only product blueprints (`*.json`) indexed by `protoyard index` as
`kind: blueprint`. Each file is a full [blueprint](../packages/blueprint/README.md)
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
