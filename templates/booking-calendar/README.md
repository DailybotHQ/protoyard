# Booking Calendar

A Protoyard starter for booking products: studios, clinics, coaches, rooms.
It has bookable **resources** (rooms and people) with weekly **opening hours**,
plus four screens:

| Screen | What it does |
| --- | --- |
| **Calendar** | A week calendar (`@protoyard/views-ui/calendar`): click a slot to book, drag or press Space to move, open a booking to cancel it |
| **Bookings** | Lists upcoming, past and cancelled bookings |
| **Book online** | The public flow: a client picks a resource, a day, a length and a **free** slot |
| **Resources** | Rooms and people with their opening hours, which the owner can change |

The services refuse overlapping bookings, and advancing simulated time turns
ended bookings into **completed** or **no-show**. Everything is simulated: the
data lives in the browser, roles are a UX simulation (not security), and no
email is sent.

```bash
pnpm protoyard new my-bookings --template booking-calendar
pnpm protoyard dev my-bookings
```

| Scenario | What you see |
| --- | --- |
| `empty` | Resources and hours set up; nothing booked. Every empty state |
| `active` *(default)* | Three weeks back and two ahead at about half occupancy; cancellations and no-shows |
| `busy-week` | Occupancy 0.9: new bookings mostly hit conflicts; few free public slots (staff persona) |
| `viewer` | The `active` setup seen by a read-only viewer |
| `client` | The `active` setup seen by a client who can only use **Book online** |

| Persona | Role | Can do |
| --- | --- | --- |
| `user_0001` Nora | owner | everything, including opening hours |
| `user_0002` Sam | staff | book, move and cancel any booking |
| `user_0003` Priya | viewer | read only |
| `user_0004` Leo | client | book free slots on **Book online** |

Open DevTools with **Ctrl/⌘ + .** to switch persona, go offline, or advance
time (watch past bookings become completed or no-show).

## How booking rules are enforced

- **Overlaps:** spans are half-open `[start, end)`, so 10:00–11:00 and
  11:00–12:00 do not clash. Only confirmed bookings hold time: cancelled,
  completed and no-show ones never block.
  - `bookings.create`, `bookings.bookPublic` and `bookings.reschedule` re-check
    inside their write transaction, reading the resource's bookings through the
    `[resourceId+start]` index. A clash is a field error, for example
    "That time overlaps “Client workshop” (10:00 AM–12:00 PM UTC)".
  - The confirm step runs through `environment.run('bookings.confirm', …)`, so
    latency, offline and failures apply.
- **Zod first:** 15-minute grid, 15 minutes to 4 hours, end after start,
  `@example.com` emails only. Then, inside the transaction: the resource
  exists, the time is in the future and fits one opening-hours rule.
- **Free slots:** the public page offers only `freeSlots()` (opening hours
  minus confirmed bookings, after "now"). The service still re-checks, in case
  the slot was taken meanwhile.
- **Time:** the timeline emits `booking.ended` for every confirmed booking
  that ends inside an advance; `applyEvent` sets completed or no-show. The
  outcome depends only on the seed and the booking id (`outcomeFor`), so it
  matches what the generator wrote for past bookings.
- **Generation:** `schedule()` from `@protoyard/scenarios` places
  non-overlapping bookings per resource and day, and recurring blocks (weekly
  cleaning). Slots outside a resource's hours are dropped.

## Layout

```text
protoyard.json               manifest (id, slug, scenarios, storage namespace + schemaVersion)
src/prototype.ts             definePrototype(): schema + policy + scenarios + generator + timeline + integrity
src/database/schema.ts       resources, availability ([resourceId+weekday]), bookings ([resourceId+start]), activity
src/domain/booking.ts        pure rules: overlaps, withinAvailability, findConflict, freeSlots, outcomeFor
src/domain/validation.ts     zod: booking span (grid, length), customer, cancel reason, opening hours
src/domain/services.ts       bookings.create / bookPublic / reschedule / cancel, availability.update
src/scenarios/index.ts       five scenarios from @protoyard/scenarios presets
src/scenarios/generators.ts  generate(ctx) with schedule(); the booking.ended timeline
src/screens/*.svelte         Calendar, Bookings, BookOnline, Resources (lazy routes)
src/components/*.svelte      BookingDialog, BookingDetails, StatusBadge, PageHeader
tests/generators.test.ts     determinism, integrity, no double-booking, statuses, rules, timeline window independence
tests/services.test.ts       overlap refusal, reschedule and cancel across reloads, rules, roles, offline, time advance
```

## Docs

- Agent spec: [AGENTS.md](AGENTS.md) and [docs/](docs/) (`pnpm protoyard spec booking-calendar --write`).
- Calendar view: [views-ui README](../../packages/views-ui/README.md); schedules: [SCENARIOS](../../docs/SCENARIOS.md).
