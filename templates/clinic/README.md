# Clinic

A Protoyard starter for a clinic front desk, on **fictional patients only**.

> **A simulation, not a medical record system.** Every patient, contact and
> note is generated. The masking, redaction and audit log show the *shape* of
> those controls; they make no HIPAA or other compliance claim. A banner says
> so on every screen. Never enter real patient or health data.

| Screen | What it does |
| --- | --- |
| **Front desk** | Today's appointments with counts (today, waiting, seen, no-shows), **Check in** while the window is open, and **Book appointment** |
| **Schedule** | Provider schedules on a calendar (`@protoyard/views-ui/calendar`); click a free slot to book |
| **Patients** | Search fictional patients by name, MRN or email; register new ones |
| **Patient** | Details with sensitive fields masked until **Reveal** (audited), edit, appointments, visit notes, access history |
| **Visit** | One appointment: check in, cancel, and the plain-text visit note (save a draft, sign) |
| **Audit log** | Who did what and when; sensitive values always read `[redacted]` |

```bash
pnpm protoyard new my-clinic --template clinic
pnpm protoyard dev my-clinic
```

| Scenario | What you see |
| --- | --- |
| `empty` | Three providers and their hours; no patients yet. Every empty state (admin) |
| `active` *(default)* | Wednesday 13:00 UTC at the front desk: 160 patients, two weeks of visits, patients waiting, a week ahead at about 60 % |
| `busy-clinic` | 2,000 patients and occupancy 0.9: new bookings mostly hit conflicts |
| `clinician` | The `active` setup seen by Dr. Mei Tan, who writes and signs notes |
| `viewer` | The `active` setup seen by a read-only reviewer: masked fields, no notes, the audit log |

| Persona | Role | Can do |
| --- | --- | --- |
| `user_0001` Dana Whitfield | admin | everything except writing notes; the audit log |
| `user_0002` Sam Okoro | front-desk | register and edit patients, book, check in, cancel, reveal |
| `user_0003` Dr. Mei Tan, `user_0004` Dr. Kwame Osei, `user_0005` Lucía Rivera | clinician | read notes, write and sign their own, reveal |
| `user_0006` Priya Das | viewer | read only, sensitive fields masked; the audit log |

Open DevTools with **Ctrl/⌘ + .** to switch persona, go offline, or advance
time (watch checked-in visits complete and no-shows appear).

## How the rules are enforced

- **Fictional data only:** the zod schemas accept `@example.com` emails,
  `+1 555-01xx` phones and `SIM-123456` insurance ids, and nothing else.
- **Booking:** spans are half-open `[start, end)` on a 15-minute grid, at most
  2 hours, inside one of the provider's hours rules. Inside the write
  transaction, `appointments.book` refuses a time when the provider is busy
  (read through `[providerId+start]`) or when the patient already has an
  appointment then. Errors are field errors, for example "Dr. Mei Tan
  already has an appointment at Oct 15, 9:00 AM UTC".
- **Check-in** opens 60 minutes before the start and closes at the end
  (`checkInBlocker()`).
- **Notes** are plain text, rendered with `whitespace-pre-wrap` (never as
  HTML). Only the provider's own persona saves and signs, and a signed note is
  final. Signing completes a checked-in visit.
- **Sensitive fields** (`SENSITIVE_PATIENT_FIELDS`: date of birth, phone,
  allergies, insurance id) are masked with a fixed-length mask.
  `patients.reveal()` returns them and writes a `patient.revealed` entry (who
  and when, no values). Every audit change stores them, and note bodies, as
  `[redacted]` (`patientChanges()`).
- **Audit:** every mutation appends its entry in the same Dexie transaction.
- **Time:** the timeline emits `appointment.ended` for every scheduled or
  checked-in appointment that ends inside an advance. Checked-in ones
  complete; scheduled ones complete or no-show (`outcomeFor()`, from the seed
  and the id), so one long advance equals many short ones.

## Layout

```text
protoyard.json               manifest (id, slug, scenarios, storage namespace + schemaVersion)
src/prototype.ts             definePrototype(): schema + policy + scenarios + generator + timeline + integrity
src/database/schema.ts       providers, availability, patients, appointments ([providerId+start]), notes, audit
src/domain/clinic.ts         pure rules: overlaps, withinHours, freeSlots, checkInBlocker, patientChanges, mask, outcomeFor
src/domain/validation.ts     zod: appointment span, fictional patient contacts, note body, cancel reason
src/domain/services.ts       patients.create / update / reveal, appointments.book / checkIn / cancel, notes.save / sign
src/scenarios/index.ts       five scenarios from @protoyard/scenarios presets
src/scenarios/generators.ts  generate(ctx) with schedule(); the appointment.ended timeline
src/screens/*.svelte         FrontDesk, Schedule, Patients, PatientDetail, Visit, Audit (lazy routes)
src/components/*.svelte      SimulationBanner, AppointmentDialog, PatientDialog, StatusBadge, PageHeader
tests/generators.test.ts     determinism, integrity, no double-booking, fictional data, statuses, no secrets in the audit, rules, timeline
tests/services.test.ts       book and check in across reloads, refusals, redacted audit, notes, roles, offline, time advance
```

## Docs

- Agent spec: [AGENTS.md](AGENTS.md) and [docs/](docs/) (`pnpm protoyard spec clinic --write`).
- Calendar view: [views-ui README](../../packages/views-ui/README.md); schedules: [SCENARIOS](../../docs/SCENARIOS.md).
