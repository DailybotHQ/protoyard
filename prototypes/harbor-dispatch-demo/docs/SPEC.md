# Harborlight Dispatch: spec

## Problem

A harbor freight carrier has to assign each same-day shipment to a driver and vehicle, keep delivery windows realistic and see where freight and depots are, often across several disconnected tools. Harborlight Dispatch shows a fictional carrier coordinating shipments through queued, dispatched, in-transit, delayed and delivered states on a board, an offline map, a timeline and a schedule, with an overview of active shipments.

The `crud-app` template you started from: Blueprint-driven starter: projects and tasks with AppShell navigation, EntityList/EntityForm, notifications bell, members and a command palette. Base template for `protoyard generate`.

## Users

Fleet managers (`owner`) hold every capability. Dispatchers (`admin`) read, create, update, delete, import and export every record. Drivers (`member`) read shipments, drivers, vehicles and depots and update only the shipments assigned to them (`shipment:update:own`). Viewers inspect the board, maps and records without changing anything. These are simulated personas, documented in [PERMISSIONS.md](PERMISSIONS.md).

## Capabilities

- Review active shipments and dispatch status on the overview dashboard.
- Move shipments between statuses on the dispatch board.
- Inspect shipment destinations and depot locations on an offline, fictional Harbor Bay map, with an accessible marker list.
- Reschedule delivery windows on the driver timeline and the weekly schedule.
- Search shipments and open a shipment's fields, activity and audit history.
- Import and export shipments as CSV when the persona holds the import or export capability.
- Browse and maintain driver, vehicle and depot records.
- Save the workspace appearance and color mode for this browser.
See [FLOWS.md](FLOWS.md) for the interaction details.

## Non-goals

Harborlight does not track real vehicles or GPS positions, plan or optimize routes, connect to telematics, carriers or customs systems, or notify drivers and customers. It has no real accounts and no live multi-user dispatch. The map is an invented coastal city drawn offline, not real geography, and every name, phone number and tracking code is fictional.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Active dispatch | Roles | normal | 123002 | — | A regular day of shipments moving through the fictional harbor. |
| `empty` | New fleet | General | empty | 123001 | — | A Harborlight team waiting for its first shipment. |
| `massive` | Fleet scale | Roles | massive | 123004 | — | A dense Harborlight sample for checking large shipment lists. |
| `viewer` | Dispatch viewer | Roles | sparse | 123003 | — | A read-only look at the delivery board and harbor map. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

Data is fictional and stored in IndexedDB in the visitor's browser; nothing is shared between visitors, so two dispatchers never see each other's changes. Personas you switch between replace sign-in, and roles and permissions (`session.assert` in the generated services) simulate UX, they are not authentication, authorization or security. Cargo values are integer-cent amounts only; nothing is billed or insured. No network service is called: the basemap is a local fictional SVG with no tile server, and latency, failures and offline mode come from the simulated environment (`environment.run`). Time is the simulation clock, so delivery windows and "in transit" states are reproducible demo data, not live tracking or background jobs. See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

- **Schema** (`src/generated/schema.ts` from `blueprint.json`): shipments, drivers, vehicles and depots become server tables with the same ids, relations, indexes, geo points and integer-cent cargo values; schema versions become server migrations.
- **Services** (`src/generated/services.ts`: zod inputs, `session.assert`, transactions and audit history): API endpoints or server actions with the same validation, checks and transaction boundaries, plus server-side checks for overlapping driver and vehicle assignments.
- **Policy** (`src/generated/policy.ts`, including `shipment:update:own` and `shipment:delete:own`): server-side authorization enforced on every request, so a driver can only change assigned shipments.
- **Personas**: a real identity provider and session management for managers, dispatchers and drivers.
- **Environment failures**: the error, retry and offline states the real board, timeline and forms must still handle, including a driver app that loses connectivity on the road.
- **Scenarios** (`src/scenarios/`): seed data for staging, demo fleets and test fixtures.
- **Maps**: the offline fictional basemap stands in for a real map and geocoding service, which needs its own choice, licensing and privacy review.
- **Screens**: the overview, board, maps, timeline, schedule, lists, detail and settings are the UI to keep; [SCREENS.md](SCREENS.md) is the acceptance list. Live tracking, routing and notifications need their own design.
See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.harbor-dispatch-demo` |
| slug | `harbor-dispatch-demo` |
| name | Harborlight Dispatch |
| version | 0.1.0 |
| platform | responsive |
| category | operations |
| default scenario | `active` |
| default theme | `harborlight-dispatch` |
| storage namespace | `harbor-dispatch-demo` |
| schema version | 1 |
| generator version | 1 |
| timeline | no |
| themes | Harborlight Dispatch (`harborlight-dispatch`) |
<!-- /protoyard:generated:manifest -->
