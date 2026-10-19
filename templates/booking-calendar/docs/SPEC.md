# Booking Calendar: spec

## Problem

Small businesses that rent rooms or sell appointments need one calendar that never double-books, a public page that shows only real free times, and a clear record of cancellations and no-shows. This template is a working booking product on simulated data, ready to remix for a studio, clinic, coaching practice or meeting rooms.

## Users

- **Owner** (`owner`, Nora): runs the business and sets opening hours.
- **Staff** (`staff`, Sam): front desk; books, moves and cancels any booking.
- **Viewer** (`viewer`, Priya): reads the calendar and bookings.
- **Client** (`client`, Leo): books free slots on the public page.

## Capabilities

- Book a slot from the calendar ([Book from the calendar](FLOWS.md#book-from-the-calendar)).
- Move a booking by drag or keyboard ([Move a booking](FLOWS.md#move-a-booking)).
- Cancel an upcoming booking with a reason ([Cancel a booking](FLOWS.md#cancel-a-booking)).
- Book a free slot online as a client ([Book online](FLOWS.md#book-online)).
- Change a resource's opening hours ([Change opening hours](FLOWS.md#change-opening-hours)).
- Watch ended bookings become completed or no-show as simulated time advances.

## Non-goals

- No payments, deposits or invoices.
- No email or SMS reminders: confirmations are on screen only.
- No time-zone conversion: every time is UTC.
- No multi-resource bookings, waitlists or recurring customer bookings (recurring blocks are internal only).

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Ordinary week | Lifecycle | normal | 4242 | `{"booking":{"seed":true},"schedule":{"occupancy":0.5}}` | Three weeks of history and two weeks ahead at about half occupancy, a few cancellations and no-shows. |
| `busy-week` | Busy week | Data | dense | 7007 | `{"booking":{"seed":true},"schedule":{"occupancy":0.9},"series":{"historyDays":60}}` | Nearly every slot is taken (occupancy 0.9): new bookings mostly hit conflicts and the public page has few free times. |
| `client` | Client booking online | Lifecycle | normal | 4242 | `{"booking":{"seed":true},"schedule":{"occupancy":0.5}}` | The “Ordinary week” setup and occupancy, seen by a client who can only use the public booking page. |
| `empty` | Brand-new calendar | Lifecycle | empty | 101 | `{"booking":{"seed":false}}` | Rooms, coaches and opening hours are set up; nothing is booked yet. Every empty state. |
| `viewer` | Read-only viewer | Lifecycle | normal | 4242 | `{"booking":{"seed":true},"schedule":{"occupancy":0.5}}` | The “Ordinary week” setup and occupancy, seen by a viewer: nothing can be booked, moved or cancelled. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

- **Data:** every resource, booking and customer is fictional and lives in the visitor's browser (IndexedDB); emails are `@example.com`.
- **People:** personas replace authentication, and roles are simulated permissions (UX only, not security). The "public" page is the same app, used by the client persona.
- **Network:** latency, offline and failures come from the simulated environment (DevTools).
- **Time:** "now" is the simulated clock; completed and no-show states appear only when simulated time advances.

## Rebuild as a real app

| Prototype piece | Real counterpart |
| --- | --- |
| `resources`, `availability`, `bookings` | A bookings database with a uniqueness or exclusion constraint per resource and time range (for example a range type with an exclusion constraint) |
| The overlap check in the transaction | The same check enforced by the database, so concurrent requests cannot double-book |
| `freeSlots()` | An availability endpoint (opening hours minus holds), with time-zone handling |
| `policy.ts` + personas | Real staff accounts, and authenticated public booking with rate limits |
| The `booking.ended` timeline | A scheduled job marking attendance, plus reminders and no-show fees |
| Scenarios | Fixtures and staging data |
| Screens | Kept as they are; swap the data layer behind `liveQuery` for API calls |

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.booking-calendar` |
| slug | `booking-calendar` |
| name | Booking Calendar |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `active` |
| default theme | `emerald` |
| storage namespace | `template-booking-calendar` |
| schema version | 1 |
| generator version | 1 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
