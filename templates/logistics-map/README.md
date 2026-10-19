# Logistics Map

A working Protoyard template for a small dispatch operation: depots, vehicles,
active shipments, an offline fictional map, and a route timeline. Seeded records
live in the browser's IndexedDB; this is a prototype simulation, not a real
fleet tracker.

```bash
pnpm protoyard new my-dispatch --template logistics-map
pnpm protoyard dev my-dispatch
```

## What works

- **Live map** — fictional Harbor Bay basemap, depot and shipment markers, and
  active routes. The accessible map list names every marker. No tiles, geocoding
  or network map requests are used.
- **Dispatch** — dispatch a ready shipment to a vehicle at its depot and reassign
  an active shipment. Services validate inputs and permissions, and persist each
  mutation in a Dexie transaction.
- **Simulated movement** — active vehicle positions interpolate along route
  stops from dispatch time to ETA. Remaining route distance drives the ETA; both
  update when simulated time advances.
- **Route timeline** — shipment windows and progress are shown in a read-only
  schedule timeline.
- **Scenarios** — active dispatch, empty desk and network offline. Offline
  dispatch attempts surface the runtime environment error without changing data.

## Checks

```bash
pnpm vitest run templates/logistics-map
pnpm --filter @protoyard-template/logistics-map typecheck
pnpm protoyard validate logistics-map --strict-spec --build
pnpm protoyard budget logistics-map
```

The `views` map and `views-ui` map/timeline subpaths are imported directly by
this template. They are not added to the `@protoyard/ui` barrel.
