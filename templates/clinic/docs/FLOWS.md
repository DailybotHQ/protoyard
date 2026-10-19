# Clinic: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

## Register a patient

1. Patients → **Register patient**, fill the form (fictional contacts only).
2. Service: `services.patients.create(input)`; editing is `services.patients.update(id, input)` from the patient page.
3. Capability: `patients:manage` (admin, front desk).
4. Writes: `patients` (next `mrn`), `audit` (`patient.created` / `patient.updated`, sensitive fields `[redacted]`).
5. Failure states: field errors inline (real-looking email, phone or insurance id, a future birth date), permission denied, simulated offline (nothing written).

## Reveal sensitive details

1. Patient page → **Reveal sensitive details** (Edit reveals first, because it shows the values).
2. Service: `services.patients.reveal(id)`.
3. Capability: `patients:reveal` (admin, front desk, clinician).
4. Writes: `audit` (`patient.revealed`, who and when, no values). The values stay in the screen's memory until hidden or the page changes.
5. Failure states: permission denied (the viewer never sees the button), simulated offline (the values stay masked).

## Book an appointment

1. Front desk → **Book appointment**, or a patient's page, or a free slot on Schedule. Search the patient by name or MRN, pick provider, reason, day, time and length.
2. Service: `services.appointments.book(input)`.
3. Capability: `appointments:manage` (admin, front desk).
4. Writes: `appointments` (`scheduled`), `audit` (`appointment.booked`).
5. Failure states: inline errors for a past time, a time outside the provider's hours, off the 15-minute grid, the provider busy, or the patient already booked then; permission denied; simulated offline.

## Check a patient in

1. Front desk → **Check in** on today's list (or on the visit page). Shown from 60 minutes before the start until the end.
2. Service: `services.appointments.checkIn(id)`.
3. Capability: `appointments:manage`.
4. Writes: `appointments` (`checked-in`, `checkedInAt`), `audit` (`appointment.checked_in`).
5. Failure states: too early, already ended or not scheduled (inline reason), permission denied, simulated offline.

## Cancel an appointment

1. Visit page → optional reason → **Cancel appointment** (scheduled and not ended only).
2. Service: `services.appointments.cancel(id, { reason })`.
3. Capability: `appointments:manage`.
4. Writes: `appointments` (`cancelled`, `cancelReason`), `audit` (`appointment.cancelled`). The time is free again.
5. Failure states: not cancellable (inline), permission denied, simulated offline.

## Write and sign a visit note

1. As the treating clinician (scenario `clinician`), open a checked-in or completed visit, type the note, **Save draft**, then **Sign note**.
2. Services: `services.notes.save(appointmentId, { body })`, `services.notes.sign(appointmentId)` (signing saves the typed text first).
3. Capability: `notes:write` (clinicians), and the persona must be the provider's `personaId`.
4. Writes: `notes` (draft, then `signedAt`), `appointments` (`checked-in` → `completed` on signing), `audit` (`note.saved`, `note.signed`, body `[redacted]`).
5. Failure states: not the treating clinician, patient not checked in, note already signed, empty or too long (inline), permission denied, simulated offline.

## Time passes

1. DevTools → advance simulated time.
2. Timeline: `clinicTimeline` emits `appointment.ended` for every scheduled or checked-in appointment ending in the window; `applyEvent` in `src/prototype.ts` applies it.
3. Capability: none (the simulation, not a user).
4. Writes: `appointments`: checked-in → `completed`; scheduled → `completed` or `no-show` (about one in ten, from the seed and the id).
5. Failure states: none. Cancelled or already resolved appointments are skipped, and one long advance equals many short ones.
