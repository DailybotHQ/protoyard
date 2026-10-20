# Screens

All operational data comes from the reviewed blueprint and its deterministic
scenario wrapper. Routes use hash navigation and work without a server.

| Route | Screen | Purpose |
| --- | --- | --- |
| `#/dashboard` | Dispatch overview | Active shipments, drivers on route and status distribution. |
| `#/dispatch/board` | Dispatch board | Move shipments through queued, dispatched, in-transit, delayed and delivered. |
| `#/dispatch/map` | Shipment map | Inspect fictional shipment destinations and the accessible marker list. |
| `#/dispatch/timeline` | Delivery timeline | Reschedule planned delivery windows with pointer or keyboard controls. |
| `#/dispatch/schedule` | Delivery schedule | Review planned starts and ends in a weekly calendar. |
| `#/depots/map` | Harbor depots | Inspect depot locations across the fictional Harbor Bay region. |
| `#/shipments` | Shipments | Search and review shipment records. |
| `#/drivers`, `#/vehicles`, `#/depots` | Fleet records | Review drivers, vehicles and depots. |

The map is a hand-authored, fictional basemap generated locally by
`@protoyard/views-ui`; it does not request map tiles or other network data.
Shipment and depot markers come from the blueprint's `harbor-bay` region.
