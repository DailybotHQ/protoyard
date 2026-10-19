# Logistics Map: spec

## Problem

Small delivery teams need one place to see where work is staged, what is moving
and which deliveries are approaching their expected arrival. This template
simulates that dispatch desk with deterministic data and simulated time.

## Users

- Dispatch lead and dispatcher: dispatch and reassign shipments.
- Driver and observer: review shipment status and routes.

## Capabilities

- View depot and active shipment locations on an offline fictional map.
- Dispatch a ready shipment to a vehicle assigned to its depot.
- Reassign an in-transit shipment to another vehicle at the same depot.
- Review route windows and time-derived position and ETA updates.

## Non-goals

- Real maps, addresses, GPS, routing optimization, traffic, notifications or
  server synchronization.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active-dispatch` | Active dispatch | Lifecycle | normal | 8421 | `{"shipments":8}` | A busy shift with ready and in-transit fictional shipments. |
| `empty` | New dispatch desk | Lifecycle | empty | 8421 | `{"shipments":0}` | A new operation with depots and vehicles but no shipments. |
| `network-offline` | Network offline | Conditions | normal | 8421 | `{"shipments":8}` | The dispatcher can review routes, while dispatch actions fail in the simulated offline network. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

All locations are generated within a fictional open-ocean region. Data is local
to this browser. Personas and permissions are simulation UX, not security. The
map, driver positions, ETAs, network failures and clock are simulated; there is
no backend or external network service.

## Rebuild as a real app

Replace the Dexie stores with a server-side shipment and fleet database; replace
simulated roles with authenticated authorization; add licensed map data, GPS
ingestion and a routing provider behind explicit consent and operational
controls. Keep offline behavior and stale-location handling explicit.

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.logistics-map` |
| slug | `logistics-map` |
| name | Logistics Map |
| version | 0.1.0 |
| platform | responsive |
| category | operations |
| default scenario | `active-dispatch` |
| default theme | `violet` |
| storage namespace | `template-logistics-map` |
| schema version | 1 |
| generator version | 1 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
