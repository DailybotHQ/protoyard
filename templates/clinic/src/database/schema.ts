import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit an old
 * one), bump `storage.schemaVersion` in protoyard.json, and add the typed
 * table to `ClinicDatabase` below.
 *
 * Relationships: provider 1─* availability rule; provider 1─* appointment;
 * patient 1─* appointment; appointment 1─0..1 visit note. `personaId`,
 * `createdBy`, `authorId` and `actorId` reference personas in `py_personas`.
 * Every instant is an ISO 8601 UTC string; appointment times are UTC.
 *
 * EVERY patient here is fictional and generated. This is a simulation, not a
 * medical record system.
 */

/** A clinician whose schedule can be booked. */
export type Provider = {
  id: string;
  name: string;
  specialty: string;
  /** The persona who signs in as this clinician (writes and signs their notes). */
  personaId: string | null;
  room: string;
};

/** Clinic hours of a provider on one weekday, `[startMinute, endMinute)` after UTC midnight. */
export type AvailabilityRule = {
  id: string;
  providerId: string;
  /** 0 = Sunday … 6 = Saturday (UTC). */
  weekday: number;
  startMinute: number;
  endMinute: number;
};

/** A fictional patient. Fields listed in `SENSITIVE_PATIENT_FIELDS` are masked and redacted from the audit log. */
export type Patient = {
  id: string;
  /** Fictional medical record number, `MRN-000123`. */
  mrn: string;
  firstName: string;
  lastName: string;
  /** `YYYY-MM-DD`. Sensitive. */
  dateOfBirth: string;
  /** Fictional, `@example.com` only. */
  email: string;
  /** Fictional, `+1 555-01xx` only. Sensitive. */
  phone: string;
  /** Free text, e.g. "Penicillin". Sensitive. */
  allergies: string;
  /** Fictional insurance member id. Sensitive. */
  insuranceId: string;
  createdAt: string;
  updatedAt: string;
};

/** Fields shown masked until revealed (an audited action) and never written to the audit log. */
export const SENSITIVE_PATIENT_FIELDS = [
  'dateOfBirth',
  'phone',
  'allergies',
  'insuranceId',
] as const;
export type SensitivePatientField = (typeof SENSITIVE_PATIENT_FIELDS)[number];

export const APPOINTMENT_STATUSES = [
  'scheduled',
  'checked-in',
  'completed',
  'no-show',
  'cancelled',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const VISIT_REASONS = [
  'Annual checkup',
  'Follow-up',
  'New concern',
  'Vaccination',
  'Lab review',
  'Prescription renewal',
] as const;

export type Appointment = {
  id: string;
  patientId: string;
  providerId: string;
  start: string;
  end: string;
  reason: string;
  status: AppointmentStatus;
  checkedInAt: string | null;
  cancelReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** A plain-text visit note (never rendered as HTML). A signed note is final. */
export type VisitNote = {
  id: string;
  appointmentId: string;
  patientId: string;
  providerId: string;
  authorId: string;
  body: string;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditAction =
  | 'patient.created'
  | 'patient.updated'
  | 'patient.revealed'
  | 'appointment.booked'
  | 'appointment.checked_in'
  | 'appointment.cancelled'
  | 'note.saved'
  | 'note.signed';

/** One changed field. Sensitive values are stored as `REDACTED`, never in clear. */
export type AuditChange = { field: string; from: string | null; to: string | null };

/** Append-only audit trail written in the same transaction as the change it describes. */
export type AuditEntry = {
  id: string;
  action: AuditAction;
  /** `patient`, `appointment` or `note`. */
  entity: 'patient' | 'appointment' | 'note';
  entityId: string;
  /** The patient the entry concerns (for the patient's access history). */
  patientId: string;
  summary: string;
  changes: AuditChange[];
  actorId: string;
  at: string;
};

export type ClinicDatabase = Dexie & {
  providers: EntityTable<Provider, 'id'>;
  availability: EntityTable<AvailabilityRule, 'id'>;
  patients: EntityTable<Patient, 'id'>;
  appointments: EntityTable<Appointment, 'id'>;
  notes: EntityTable<VisitNote, 'id'>;
  audit: EntityTable<AuditEntry, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        providers: 'id, personaId',
        availability: 'id, providerId, [providerId+weekday]',
        patients: 'id, &mrn, lastName',
        // [providerId+start] serves "this provider's appointments in a range" (the overlap check).
        appointments: 'id, patientId, providerId, start, status, [providerId+start]',
        notes: 'id, &appointmentId, patientId, providerId',
        audit: 'id, entityId, patientId, at',
      },
    },
  ],
};
