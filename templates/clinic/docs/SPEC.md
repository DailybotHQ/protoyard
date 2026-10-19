# Clinic: spec

## Problem

A clinic front desk juggles provider schedules, arriving patients and
documentation at once. This template simulates that workflow on fictional
patients, so a team can try booking, check-in, visit notes and audit
behavior without touching any real health data.

## Users

- Front-desk staff (`front-desk`): register, book, check in, cancel.
- Clinicians (`clinician`): write and sign visit notes for their own patients.
- The practice manager (`admin`): everything but notes, plus the audit log.
- A quality reviewer (`viewer`): read-only, sensitive fields masked, audit log.

## Capabilities

- [Register and edit fictional patients](FLOWS.md#register-a-patient), with obviously fictional contacts only.
- [Reveal sensitive details](FLOWS.md#reveal-sensitive-details), an audited action.
- [Book appointments](FLOWS.md#book-an-appointment) in provider hours, never double-booking a provider or a patient.
- [Check patients in](FLOWS.md#check-a-patient-in) from the front-desk dashboard.
- [Cancel appointments](FLOWS.md#cancel-an-appointment) with a reason.
- [Write and sign plain-text visit notes](FLOWS.md#write-and-sign-a-visit-note) as the treating clinician.
- [Let time pass](FLOWS.md#time-passes): visits complete and no-shows appear.
- Read the audit log, where sensitive values are always `[redacted]`.

## Non-goals

- No real patients, medical records, diagnoses, prescriptions, billing,
  insurance claims, lab results, e-prescribing or messaging.
- No HIPAA, GDPR or any other compliance claim, and no clinical safety
  claim. It must never hold real patient or health data.
- No recurring appointments, waitlists, reminders or patient self-booking.
- No time zones other than UTC.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Ordinary Wednesday | Lifecycle | normal | 4242 | `{"clinic":{"patients":160,"seed":true},"schedule":{"occupancy":0.6}}` | The front desk mid-afternoon: 160 fictional patients, two weeks of history, patients waiting and a week ahead booked at about 60 %. |
| `busy-clinic` | Busy clinic | Data | dense | 7007 | `{"clinic":{"patients":2000,"seed":true},"schedule":{"occupancy":0.9},"series":{"historyDays":60}}` | 2,000 fictional patients and nearly every slot taken (occupancy 0.9): new bookings mostly hit conflicts. |
| `clinician` | Clinician’s day | Lifecycle | normal | 4242 | `{"clinic":{"patients":160,"seed":true},"schedule":{"occupancy":0.6}}` | The “Ordinary Wednesday” setup and occupancy, seen by Dr. Mei Tan: write and sign visit notes for checked-in patients. |
| `empty` | Brand-new clinic | Lifecycle | empty | 101 | `{"clinic":{"seed":false}}` | Providers and clinic hours are set up; no patients or appointments yet. Every empty state. |
| `viewer` | Read-only reviewer | Lifecycle | normal | 4242 | `{"clinic":{"patients":160,"seed":true},"schedule":{"occupancy":0.6}}` | The “Ordinary Wednesday” setup seen by a read-only reviewer: sensitive fields stay masked and visit notes are hidden. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

- **Everything is a simulation.** Patients, providers, appointments and
  notes are generated fictional data, stored in the visitor's own browser
  (IndexedDB). Nothing is sent anywhere.
- **Not a compliance claim.** Masking, redaction and the audit log
  demonstrate the *shape* of these controls. They are not HIPAA (or any
  other) compliance, encryption or access control, and the banner says so.
- **Personas, not sign-in.** Switching persona in DevTools changes the role.
  Roles and the "treating clinician" check are a UX simulation; any visitor
  can read every table in their browser.
- **Network and time** are simulated: latency, offline and failures come
  from the environment overrides, and "now" is the simulated clock.

## Rebuild as a real app

- **Schema** → a server database with encryption at rest, and an EHR or
  FHIR integration for patients, encounters and notes, designed with
  compliance and clinical-safety experts.
- **Services** → server endpoints holding the same rules (hours, overlaps,
  check-in window, note signing) in database transactions.
- **Policy and personas** → real authentication (SSO, MFA) and server-side,
  least-privilege authorization, including the treating-clinician rule.
- **Reveal and audit** → a tamper-evident, server-written access log with
  retention rules; masking enforced by the API, not the screen.
- **Environment failures** → real retries, conflict handling and an offline
  strategy that never loses a note.
- **Scenarios** → seed and test data only; never import real records.
- **Screens** → the same flows, reviewed for accessibility and clinical
  usability.

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.clinic` |
| slug | `clinic` |
| name | Clinic |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `active` |
| default theme | `health-clinic` |
| storage namespace | `template-clinic` |
| schema version | 1 |
| generator version | 1 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
