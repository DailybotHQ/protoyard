# Cadence Studio: spec

## Problem

A small creative studio juggles classes, instructors, rooms and client bookings across a busy week, and double bookings or lost changes are easy when the schedule lives in spreadsheets. Cadence Studio shows a fictional neighborhood studio running its week from one generated workspace: a weekly calendar to book and move sessions, booking records with history, and an overview of booking status.

The `crud-app` template you started from: Blueprint-driven starter: projects and tasks with AppShell navigation, EntityList/EntityForm, notifications bell, members and a command palette. Base template for `protoyard generate`.

## Users

Owners and admins run the studio and hold every capability, including members and deleting their own bookings. Members are booking coordinators: they read everything and create or update bookings and clients, but only read classes, instructors and rooms. Viewers inspect the schedule and records without changing anything. These are simulated personas, documented in [PERMISSIONS.md](PERMISSIONS.md).

## Capabilities

- Review booking, class and client counts and bookings by status on the studio overview.
- Create a one-hour booking from an empty slot on the weekly calendar (agenda on phones).
- Move a booking by pointer drag or with the keyboard (Space, arrow keys, Enter or Escape).
- Search booking records and open a booking's fields and activity history.
- Browse the supporting client, class, instructor and room records.
- Save the studio appearance and color mode for this browser.
See [FLOWS.md](FLOWS.md) for the interaction details.

## Non-goals

Cadence Studio does not take payments or send booking confirmations, reminders or invoices. It has no real accounts, no shared or synced calendar, no external calendar integration and no capacity or waitlist enforcement beyond the stored fields. All names, classes and bookings are fictional.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Active | Roles | normal | 123002 | — | A normal density workspace for day-to-day demos. |
| `empty` | Empty | General | empty | 123001 | — | Team only — no projects or tasks yet. |
| `massive` | Massive | Roles | massive | 123004 | — | Dense seed for list virtualization and budget checks. |
| `viewer` | Viewer | Roles | sparse | 123003 | — | Read-only stroll through seeded work. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

Data is fictional and stored in IndexedDB in the visitor's browser; nothing is shared between visitors or synced. Personas you switch between replace sign-in, and roles and permissions (`session.assert` in the generated services) simulate UX, they are not authentication, authorization or security. Booking prices are integer-cent amounts only: nobody is charged and there is no billing. No network service is called; latency, failures and offline mode come from the simulated environment (`environment.run`). Time is the simulation clock, so the calendar shows a fixed, reproducible week rather than real schedules or background jobs. See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

- **Schema** (`src/generated/schema.ts` from `blueprint.json`): bookings, clients, classes, instructors and rooms become server tables with the same ids, relations, indexes and integer-cent prices; schema versions become server migrations.
- **Services** (`src/generated/services.ts`: zod inputs, `session.assert`, transactions, soft delete and audit history): API endpoints or server actions with the same validation, checks and transaction boundaries, plus real double-booking and room-capacity checks on the server.
- **Policy** (`src/generated/policy.ts`, including `booking:update:own` and `booking:delete:own`): server-side authorization enforced on every request.
- **Personas**: a real identity provider and session management for studio staff.
- **Environment failures**: the error, retry and offline states the real calendar and forms must still handle.
- **Scenarios** (`src/scenarios/`): seed data for staging, demo studios and test fixtures.
- **Screens**: the overview, calendar, booking list and detail, and settings are the UI to keep; [SCREENS.md](SCREENS.md) is the acceptance list. Payments, confirmations and calendar sync need their own design.
See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `local.cadence-studio-demo` |
| slug | `cadence-studio-demo` |
| name | Cadence Studio |
| version | 0.1.0 |
| platform | responsive |
| category | productivity |
| default scenario | `active` |
| default theme | `cadence-studio` |
| storage namespace | `cadence-studio-demo` |
| schema version | 1 |
| generator version | 1 |
| timeline | no |
| themes | Cadence Studio (`cadence-studio`) |
<!-- /protoyard:generated:manifest -->
