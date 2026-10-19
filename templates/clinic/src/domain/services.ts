import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import type {
  Appointment,
  AuditAction,
  AuditChange,
  AuditEntry,
  ClinicDatabase,
  Patient,
  SensitivePatientField,
  VisitNote,
} from '../database/schema.ts';
import {
  checkInBlocker,
  findConflict,
  patientChanges,
  patientName,
  REDACTED,
  withinHours,
} from './clinic.ts';
import { CAPABILITIES } from './policy.ts';
import {
  type AppointmentInput,
  AppointmentInputSchema,
  type CancelInput,
  CancelInputSchema,
  MAX_APPOINTMENT_MINUTES,
  type NoteInput,
  NoteInputSchema,
  type PatientInput,
  PatientInputSchema,
  parse,
  ValidationError,
} from './validation.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input with zod (field errors come back as `ValidationError.issues`),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes in ONE Dexie transaction together with its audit entry, which
 *      never contains a sensitive value (they are stored as `[redacted]`).
 */

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`This ${what} no longer exists. It may have been changed in another tab.`);
    this.name = 'NotFoundError';
  }
}

const PATIENT_FIELDS = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'email',
  'phone',
  'allergies',
  'insuranceId',
] as const satisfies readonly (keyof Patient)[];

const time = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});
const when = (a: Pick<Appointment, 'start'>) => `${time.format(Date.parse(a.start))} UTC`;

export function createServices(runtime: PrototypeRuntime<ClinicDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };
  const audit = (
    action: AuditAction,
    entity: AuditEntry['entity'],
    entityId: string,
    patientId: string,
    summary: string,
    changes: AuditChange[] = []
  ): AuditEntry => ({
    id: createRuntimeId('audit'),
    action,
    entity,
    entityId,
    patientId,
    summary,
    changes,
    actorId: actorId(),
    at: now(),
  });

  function assertBorn(dateOfBirth: string) {
    if (dateOfBirth > now().slice(0, 10)) {
      throw new ValidationError({ dateOfBirth: 'The date of birth cannot be in the future' });
    }
  }

  /** Inside the transaction: the treating clinician of an appointment is the current persona. */
  async function assertTreating(appointment: Appointment) {
    const provider = await db.providers.get(appointment.providerId);
    if (!provider || provider.personaId !== actorId()) {
      throw new ValidationError({
        body: `Only ${provider?.name ?? 'the treating clinician'} can write or sign this note`,
      });
    }
  }

  return {
    patients: {
      /** Registers a fictional patient with the next medical record number. */
      async create(input: PatientInput): Promise<Patient> {
        session.assert(CAPABILITIES.patientsManage);
        const data = parse(PatientInputSchema, input);
        assertBorn(data.dateOfBirth);
        return environment.run('patients.create', () =>
          db.transaction('rw', db.patients, db.audit, async () => {
            const last = await db.patients.orderBy('mrn').last();
            const next = Number(last?.mrn.slice(4) ?? 0) + 1;
            const at = now();
            const patient: Patient = {
              id: createRuntimeId('patient'),
              mrn: `MRN-${String(next).padStart(6, '0')}`,
              ...data,
              createdAt: at,
              updatedAt: at,
            };
            await db.patients.add(patient);
            await db.audit.add(
              audit(
                'patient.created',
                'patient',
                patient.id,
                patient.id,
                `Registered ${patientName(patient)} (${patient.mrn})`,
                patientChanges(null, patient, PATIENT_FIELDS)
              )
            );
            return patient;
          })
        );
      },

      /** Edits a patient's details; the audit lists which fields changed, sensitive ones redacted. */
      async update(id: string, input: PatientInput): Promise<Patient> {
        session.assert(CAPABILITIES.patientsManage);
        const data = parse(PatientInputSchema, input);
        assertBorn(data.dateOfBirth);
        return environment.run('patients.update', () =>
          db.transaction('rw', db.patients, db.audit, async () => {
            const patient = await db.patients.get(id);
            if (!patient) throw new NotFoundError('patient');
            const next: Patient = { ...patient, ...data, updatedAt: now() };
            const changes = patientChanges(patient, next, PATIENT_FIELDS);
            if (changes.length === 0) return patient;
            await db.patients.put(next);
            await db.audit.add(
              audit(
                'patient.updated',
                'patient',
                id,
                id,
                `Updated ${patientName(next)} (${changes.map((c) => c.field).join(', ')})`,
                changes
              )
            );
            return next;
          })
        );
      },

      /**
       * Returns the sensitive fields of one patient and records that they were
       * viewed (who and when, never the values). The screen keeps them in
       * memory only while it is open.
       */
      async reveal(id: string): Promise<Pick<Patient, SensitivePatientField>> {
        session.assert(CAPABILITIES.patientsReveal);
        return environment.run('patients.reveal', () =>
          db.transaction('rw', db.patients, db.audit, async () => {
            const patient = await db.patients.get(id);
            if (!patient) throw new NotFoundError('patient');
            await db.audit.add(
              audit(
                'patient.revealed',
                'patient',
                id,
                id,
                `Viewed the sensitive details of ${patientName(patient)}`
              )
            );
            const { dateOfBirth, phone, allergies, insuranceId } = patient;
            return { dateOfBirth, phone, allergies, insuranceId };
          })
        );
      },
    },

    appointments: {
      /** Books an appointment in the provider's hours, free for both the provider and the patient. */
      async book(input: AppointmentInput): Promise<Appointment> {
        session.assert(CAPABILITIES.appointmentsManage);
        const data = parse(AppointmentInputSchema, input);
        return environment.run('appointments.book', () =>
          db.transaction(
            'rw',
            [db.providers, db.availability, db.patients, db.appointments, db.audit],
            async () => {
              const [provider, patient] = await Promise.all([
                db.providers.get(data.providerId),
                db.patients.get(data.patientId),
              ]);
              if (!provider)
                throw new ValidationError({ providerId: 'That provider no longer exists' });
              if (!patient)
                throw new ValidationError({ patientId: 'That patient no longer exists' });
              if (Date.parse(data.start) <= clock.now().getTime()) {
                throw new ValidationError({ start: 'Pick a time in the future' });
              }
              const rules = await db.availability.where('providerId').equals(provider.id).toArray();
              if (!withinHours(rules, data)) {
                throw new ValidationError({
                  start: `That time is outside ${provider.name}'s hours`,
                });
              }
              // Appointments that could overlap start before this one ends and at most MAX before it starts.
              const nearby = await db.appointments
                .where('[providerId+start]')
                .between(
                  [
                    provider.id,
                    new Date(
                      Date.parse(data.start) - MAX_APPOINTMENT_MINUTES * 60_000
                    ).toISOString(),
                  ],
                  [provider.id, data.end],
                  true,
                  false
                )
                .toArray();
              const busy = findConflict(nearby, data, () => true);
              if (busy) {
                throw new ValidationError({
                  start: `${provider.name} already has an appointment at ${when(busy)}`,
                });
              }
              const own = await db.appointments.where('patientId').equals(patient.id).toArray();
              const clash = findConflict(own, data, () => true);
              if (clash) {
                throw new ValidationError({
                  patientId: `${patientName(patient)} already has an appointment at ${when(clash)}`,
                });
              }
              const at = now();
              const appointment: Appointment = {
                id: createRuntimeId('appointment'),
                patientId: patient.id,
                providerId: provider.id,
                start: data.start,
                end: data.end,
                reason: data.reason,
                status: 'scheduled',
                checkedInAt: null,
                cancelReason: null,
                createdBy: actorId(),
                createdAt: at,
                updatedAt: at,
              };
              await db.appointments.add(appointment);
              await db.audit.add(
                audit(
                  'appointment.booked',
                  'appointment',
                  appointment.id,
                  patient.id,
                  `Booked ${patientName(patient)} with ${provider.name} at ${when(appointment)}`
                )
              );
              return appointment;
            }
          )
        );
      },

      /** Marks the patient as arrived: from an hour before the start until the end. */
      async checkIn(id: string): Promise<Appointment> {
        session.assert(CAPABILITIES.appointmentsManage);
        return environment.run('appointments.check-in', () =>
          db.transaction('rw', db.appointments, db.patients, db.audit, async () => {
            const appointment = await db.appointments.get(id);
            if (!appointment) throw new NotFoundError('appointment');
            const blocker = checkInBlocker(appointment, clock.now());
            if (blocker) throw new ValidationError({ status: blocker });
            const at = now();
            const next: Appointment = {
              ...appointment,
              status: 'checked-in',
              checkedInAt: at,
              updatedAt: at,
            };
            await db.appointments.put(next);
            const patient = await db.patients.get(appointment.patientId);
            await db.audit.add(
              audit(
                'appointment.checked_in',
                'appointment',
                id,
                appointment.patientId,
                `Checked in ${patientName(patient)} for ${when(appointment)}`,
                [{ field: 'status', from: 'scheduled', to: 'checked-in' }]
              )
            );
            return next;
          })
        );
      },

      /** Cancels a scheduled appointment that has not ended; its time becomes free again. */
      async cancel(id: string, input: CancelInput = {}): Promise<void> {
        session.assert(CAPABILITIES.appointmentsManage);
        const { reason } = parse(CancelInputSchema, input);
        await environment.run('appointments.cancel', () =>
          db.transaction('rw', db.appointments, db.patients, db.audit, async () => {
            const appointment = await db.appointments.get(id);
            if (!appointment) throw new NotFoundError('appointment');
            if (
              appointment.status !== 'scheduled' ||
              Date.parse(appointment.end) <= clock.now().getTime()
            ) {
              throw new ValidationError({
                reason: 'Only upcoming scheduled appointments can be cancelled',
              });
            }
            await db.appointments.put({
              ...appointment,
              status: 'cancelled',
              cancelReason: reason || null,
              updatedAt: now(),
            });
            const patient = await db.patients.get(appointment.patientId);
            await db.audit.add(
              audit(
                'appointment.cancelled',
                'appointment',
                id,
                appointment.patientId,
                `Cancelled ${patientName(patient)} at ${when(appointment)}`,
                [{ field: 'status', from: 'scheduled', to: 'cancelled' }]
              )
            );
          })
        );
      },
    },

    notes: {
      /** Writes or edits the draft note of a checked-in or completed visit (treating clinician only). */
      async save(appointmentId: string, input: NoteInput): Promise<VisitNote> {
        session.assert(CAPABILITIES.notesWrite);
        const { body } = parse(NoteInputSchema, input);
        return environment.run('notes.save', () =>
          db.transaction('rw', [db.appointments, db.providers, db.notes, db.audit], async () => {
            const appointment = await db.appointments.get(appointmentId);
            if (!appointment) throw new NotFoundError('appointment');
            if (appointment.status !== 'checked-in' && appointment.status !== 'completed') {
              throw new ValidationError({
                body: 'Notes are written once the patient has checked in',
              });
            }
            await assertTreating(appointment);
            const existing = await db.notes.where('appointmentId').equals(appointmentId).first();
            if (existing?.signedAt) {
              throw new ValidationError({ body: 'This note is signed and can no longer change' });
            }
            const at = now();
            const note: VisitNote = existing
              ? { ...existing, body, updatedAt: at }
              : {
                  id: createRuntimeId('note'),
                  appointmentId,
                  patientId: appointment.patientId,
                  providerId: appointment.providerId,
                  authorId: actorId(),
                  body,
                  signedAt: null,
                  createdAt: at,
                  updatedAt: at,
                };
            await db.notes.put(note);
            await db.audit.add(
              audit(
                'note.saved',
                'note',
                note.id,
                appointment.patientId,
                existing ? 'Edited a draft visit note' : 'Started a visit note',
                [{ field: 'body', from: existing ? REDACTED : null, to: REDACTED }]
              )
            );
            return note;
          })
        );
      },

      /** Signs the note (final) and completes a checked-in visit. */
      async sign(appointmentId: string): Promise<VisitNote> {
        session.assert(CAPABILITIES.notesWrite);
        return environment.run('notes.sign', () =>
          db.transaction('rw', [db.appointments, db.providers, db.notes, db.audit], async () => {
            const appointment = await db.appointments.get(appointmentId);
            if (!appointment) throw new NotFoundError('appointment');
            await assertTreating(appointment);
            const note = await db.notes.where('appointmentId').equals(appointmentId).first();
            if (!note) throw new ValidationError({ body: 'Save the note before signing it' });
            if (note.signedAt) throw new ValidationError({ body: 'This note is already signed' });
            const at = now();
            const signed: VisitNote = { ...note, signedAt: at, updatedAt: at };
            await db.notes.put(signed);
            if (appointment.status === 'checked-in') {
              await db.appointments.put({ ...appointment, status: 'completed', updatedAt: at });
            }
            await db.audit.add(
              audit('note.signed', 'note', note.id, appointment.patientId, 'Signed a visit note', [
                ...(appointment.status === 'checked-in'
                  ? [{ field: 'status', from: 'checked-in', to: 'completed' }]
                  : []),
              ])
            );
            return signed;
          })
        );
      },
    },
  };
}

export type ClinicServices = ReturnType<typeof createServices>;
