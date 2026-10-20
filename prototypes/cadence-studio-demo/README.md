# Cadence Studio

Cadence Studio is a fictional class-booking workspace for a neighborhood creative studio. Its blueprint is the source of truth for the generated data model, routes, brand theme and layout.

## Screens

- **Studio overview** (`#/`): booking, class and client counts plus booking status.
- **Bookings calendar** (`#/bookings/calendar`): weekly schedule on desktop and agenda on phones. Coordinators create a booking from an empty slot and move an event with drag or keyboard controls.
- **Bookings** (`#/bookings`): searchable generated booking records.
- **Booking details** (`#/bookings/<id>`): booking fields and activity history.
- **Settings** (`#/settings`): saved studio appearance and color mode.
- Supporting generated records: clients, classes, instructors and rooms.

## Roles and scenarios

- `owner` manages the studio; `member` coordinates bookings; `viewer` has read-only access.
- `active` (default) seeds a realistic schedule; `empty` is a clean setup; `viewer` switches to the read-only persona; `massive` stress-tests generated records.
- All data stays in this browser. Roles are simulated UX, not security. Names, classes and bookings are fictional; no network service is called.

## Run and validate

```bash
pnpm protoyard dev cadence-studio-demo
pnpm vitest run prototypes/cadence-studio-demo
pnpm protoyard validate cadence-studio-demo --strict-spec --build
pnpm protoyard export cadence-studio-demo
```

Regenerate source-owned files after editing [blueprint.json](blueprint.json):

```bash
pnpm protoyard generate cadence-studio-demo --blueprint prototypes/cadence-studio-demo/blueprint.json
pnpm protoyard spec cadence-studio-demo --write
```
