# Clinic: screens

## Routes

<!-- protoyard:generated:routes -->
| Route | Screen | Capability | Description |
| --- | --- | --- | --- |
| `#/` | Front desk | — | Today's appointments: check patients in, see who is waiting, book and cancel. |
| `#/schedule` | Schedule | — | Provider schedules on a week calendar; click a free slot to book. |
| `#/patients` | Patients | — | Search fictional patients and register new ones. |
| `#/patients/:id` | Patient | — | One patient: details with masked sensitive fields, appointments and visit notes. |
| `#/visits/:id` | Visit | — | One appointment: check-in and the plain-text visit note (write, save, sign). |
| `#/audit` | Audit log | — | Who did what, when; sensitive values are always redacted. |
<!-- /protoyard:generated:routes -->

## Screens

<!-- protoyard:generated:screens -->
| Screen | Route | Description |
| --- | --- | --- |
| Front desk | `#/` | Today's appointments: check patients in, see who is waiting, book and cancel. |
| Schedule | `#/schedule` | Provider schedules on a week calendar; click a free slot to book. |
| Patients | `#/patients` | Search fictional patients and register new ones. |
| Patient | `#/patients/:id` | One patient: details with masked sensitive fields, appointments and visit notes. |
| Visit | `#/visits/:id` | One appointment: check-in and the plain-text visit note (write, save, sign). |
| Audit log | `#/audit` | Who did what, when; sensitive values are always redacted. |
<!-- /protoyard:generated:screens -->

- **Front desk** (`FrontDesk.svelte`): today's appointments (UTC day of the
  simulated clock) with four counts (today, waiting, seen, no-shows), a
  provider filter, **Book appointment** and **Check in** per row while the
  check-in window is open. Loading: skeleton rows. Empty: "No appointments
  today". Denied: the viewer and clinicians see the list without booking or
  check-in buttons.
- **Schedule** (`Schedule.svelte`): the views-ui `CalendarView` (day, week,
  month, agenda) of every non-cancelled appointment, colored by status, with
  a provider filter. Clicking a free slot opens the booking dialog (front desk
  and admin only); opening an appointment goes to its visit.
- **Patients** (`Patients.svelte`): a searchable, sortable table (name, MRN,
  email, a masked date of birth). **Register patient** for admin and front
  desk. Empty: "No patients yet", or "No patient matches" for a search.
- **Patient** (`PatientDetail.svelte`): details with each sensitive field
  masked and tagged, **Reveal sensitive details** / **Hide**, **Edit**,
  **Book appointment**, the appointment history, visit notes (clinicians and
  admins; others see "Visit notes are visible to clinicians and admins
  only"), and the patient's access and change history (admin and viewer).
  Not found: an empty state with a link back.
- **Visit** (`Visit.svelte`): the appointment, check-in and cancellation (front
  desk), and the note: an editor with **Save draft** and **Sign note** for the
  treating clinician, the plain-text note for other clinicians and admins, a
  notice for everyone else. Field errors render inline. Not found: an empty
  state.
- **Audit log** (`Audit.svelte`): every entry newest first with who, what and
  the changed fields (`[redacted]` for sensitive ones), searchable. Denied:
  "Admins and reviewers only".

Every screen sits under the simulation banner. Service errors that are not
field errors (offline, simulated failures) toast through `runService`.

## Shell

A responsive web app (`preview.viewport: desktop`). The sidebar collapses
into a drawer below `lg`; lists stack on phones, and the tables hide
secondary columns below `sm` / `md`. The page scrolls as a document.
