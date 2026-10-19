# AGENTS.md — Booking Calendar (`booking-calendar`)

The entry point for agents working on this prototype. Repository-wide rules
live in the root [AGENTS.md](../../AGENTS.md); the spec standard is
[docs/SPECS.md](../../docs/SPECS.md).

## Index

- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, honest boundaries, rebuild path
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, indexes, relations, schema versions
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/SCREENS.md](docs/SCREENS.md): routes, screens and their states
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, rules, personas

## Rules for this prototype

- **No double booking, ever.** `bookings.create`, `bookPublic` and `reschedule` re-check overlaps **inside** the write transaction through `[resourceId+start]`. Do not move that check to the UI.
- **Spans are half-open and UTC.** `[start, end)`; 10:00–11:00 and 11:00–12:00 do not clash. Only `confirmed` bookings hold time.
- **Shared rules.** `src/domain/booking.ts` (`overlaps`, `withinAvailability`, `findConflict`, `freeSlots`, `outcomeFor`) is used by the services, the public page and the generator. Change it there, not in a screen.
- **Bookings come from `schedule()`.** It seeds each resource and day by scenario id and seed, so two scenarios share setup and occupancy but not the exact bookings.
- **Time.** Ended bookings become completed or no-show only through the `booking.ended` timeline event. `outcomeFor(seed, id)` decides which, matching what the generator wrote. Bump `BOOKING_GENERATOR_VERSION` when output can change.
- **Fictional data.** Customer emails must be `@example.com` (validated).

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev booking-calendar                  # run it (DevTools included)
pnpm vitest run prototypes/booking-calendar          # unit + integration tests
pnpm protoyard validate booking-calendar --build     # contract, schema, build
pnpm protoyard spec booking-calendar --check         # generated spec regions are current
pnpm protoyard export booking-calendar               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
