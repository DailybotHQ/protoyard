import {
  type DomainEvent,
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  type Organization,
  type Persona,
  type TimelineContext,
  type WorldSeed,
} from '@protoyard/core';
import { schedule } from '@protoyard/scenarios';
import {
  type Appointment,
  type AuditEntry,
  type AvailabilityRule,
  type Patient,
  type Provider,
  VISIT_REASONS,
  type VisitNote,
} from '../database/schema.ts';
import { CHECK_IN_OPENS_MINUTES, outcomeFor, overlaps, withinHours } from '../domain/clinic.ts';
import type { ClinicGeneratorOptions } from './index.ts';

/**
 * Deterministic world builder. Appointments come from `schedule()` in
 * @protoyard/scenarios: each (provider, day) has its own rng, so a provider's
 * slots never overlap and a day's slots never depend on the window asked for.
 * Everything else uses `ctx.rng` forks, `ctx.faker`, `ctx.ids` and the
 * scenario reference time. Order: people → providers and hours → patients →
 * appointments → notes → audit.
 *
 * Every patient, contact and note is fictional and generated.
 */

/** Bump when the same seed would produce a different world. */
export const CLINIC_GENERATOR_VERSION = 1;

const PEOPLE = [
  {
    id: 'user_0001',
    name: 'Dana Whitfield',
    title: 'Practice manager',
    role: 'admin',
    color: '#0369a1',
  },
  { id: 'user_0002', name: 'Sam Okoro', title: 'Front desk', role: 'front-desk', color: '#7c3aed' },
  {
    id: 'user_0003',
    name: 'Dr. Mei Tan',
    title: 'Family physician',
    role: 'clinician',
    color: '#0d9488',
  },
  {
    id: 'user_0004',
    name: 'Dr. Kwame Osei',
    title: 'Pediatrician',
    role: 'clinician',
    color: '#c2410c',
  },
  {
    id: 'user_0005',
    name: 'Lucía Rivera',
    title: 'Nurse practitioner',
    role: 'clinician',
    color: '#be185d',
  },
  {
    id: 'user_0006',
    name: 'Priya Das',
    title: 'Quality reviewer (read-only)',
    role: 'viewer',
    color: '#a16207',
  },
] as const;

const PROVIDERS: (Provider & { hours: { weekdays: number[]; open: number; close: number }[] })[] = [
  {
    id: 'prov_tan',
    name: 'Dr. Mei Tan',
    specialty: 'Family medicine',
    personaId: 'user_0003',
    room: 'Room 1',
    hours: [{ weekdays: [1, 2, 3, 4, 5], open: 8, close: 16 }],
  },
  {
    id: 'prov_osei',
    name: 'Dr. Kwame Osei',
    specialty: 'Pediatrics',
    personaId: 'user_0004',
    room: 'Room 2',
    hours: [{ weekdays: [1, 2, 3, 4], open: 9, close: 17 }],
  },
  {
    id: 'prov_rivera',
    name: 'Lucía Rivera, NP',
    specialty: 'Nurse practitioner',
    personaId: 'user_0005',
    room: 'Room 3',
    hours: [
      { weekdays: [2, 3, 4, 5], open: 10, close: 18 },
      { weekdays: [6], open: 9, close: 13 },
    ],
  },
];

const ALLERGIES = ['', '', '', 'None known', 'Penicillin', 'Peanuts', 'Latex', 'Sulfa drugs'];
const CANCEL_REASONS = [
  'Patient rescheduled',
  'Feeling better',
  'Transport problem',
  'Clinic closure',
];
const NOTE_PARTS = {
  subjective: [
    'Routine visit, no new complaints',
    'Reports a mild cough for five days',
    'Follow-up on blood pressure readings at home',
    'Asks about a seasonal vaccine',
    'Reports trouble sleeping for two weeks',
  ],
  objective: [
    'Vitals within normal range',
    'Mild throat redness, lungs clear',
    'Blood pressure slightly above target',
    'Weight stable since the last visit',
  ],
  assessment: [
    'Healthy, no concerns',
    'Likely viral upper respiratory infection',
    'Blood pressure improving',
    'Sleep hygiene issue',
  ],
  plan: [
    'Return in one year',
    'Rest and fluids; return if worse in a week',
    'Continue current plan; recheck in a month',
    'Vaccine given; no reaction observed',
    'Sleep diary for two weeks, then follow up',
  ],
};

function options(ctx: GenerateContext): ClinicGeneratorOptions {
  const raw = (ctx.scenario.generators.clinic ?? {}) as Partial<ClinicGeneratorOptions>;
  return {
    seed: raw.seed !== false,
    patients: Math.max(0, Math.min(5000, Math.round(raw.patients ?? 160))),
  };
}

function identities(ctx: GenerateContext) {
  const { scenario, time } = ctx;
  const ageDays = scenario.organization.ageDays;
  const subscription = scenario.organization.subscription;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Maple Grove Clinic (fictional)',
    type: 'company',
    plan: subscription === 'trial' || subscription === 'expired' ? 'pro' : subscription,
    billingStatus:
      subscription === 'expired' ? 'expired' : subscription === 'trial' ? 'trialing' : 'active',
    createdAt: time.iso(time.daysAgo(ageDays)),
    size: PEOPLE.length,
    featureFlags: { ...scenario.organization.featureFlags },
  };
  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  PEOPLE.forEach((p, index) => {
    const days =
      p.id === scenario.actor.id
        ? Math.min(ageDays, scenario.actor.joinedDaysAgo)
        : index === 0
          ? ageDays
          : Math.round(ageDays * (1 - index / (PEOPLE.length + 1)));
    const joinedAt = time.iso(time.daysAgo(days));
    const role = p.id === scenario.actor.id ? scenario.actor.role : p.role;
    const first = (p.name.replace(/^Dr\. /, '').split(' ')[0] ?? 'staff')
      .normalize('NFD')
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase();
    personas.push({
      id: p.id,
      name: p.name,
      email: `${first}@example.com`,
      title: p.title,
      avatarColor: p.color,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt,
      onboardingComplete: true,
      preferences: {},
      summary: `${p.title} · ${role}, joined ${days === 0 ? 'today' : `${days} days ago`}`,
    });
    memberships.push({
      id: `membership_${String(index + 1).padStart(4, '0')}`,
      personaId: p.id,
      organizationId: organization.id,
      role,
      joinedAt,
      capabilities: [],
    });
  });
  return { organization, personas, memberships };
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

function generatePatients(ctx: GenerateContext, count: number, from: number, to: number) {
  const rng = ctx.rng.fork('patients');
  const ref = new Date(to);
  const patients: Patient[] = [];
  for (let i = 0; i < count; i++) {
    const firstName = ctx.faker.person.firstName();
    const lastName = ctx.faker.person.lastName();
    // Ages 0 to 89, any day of the year.
    const born = new Date(
      Date.UTC(ref.getUTCFullYear() - rng.int(0, 89), rng.int(0, 11), rng.int(1, 28))
    );
    const createdAt = new Date(from + Math.floor(rng.next() * (to - from))).toISOString();
    const handle = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, '');
    patients.push({
      id: ctx.ids.next('patient'),
      mrn: `MRN-${pad(i + 1, 6)}`,
      firstName,
      lastName,
      dateOfBirth: (born.getTime() > to ? ref : born).toISOString().slice(0, 10),
      email: `${handle}.${i + 1}@example.com`,
      phone: `+1 555-01${pad(rng.int(0, 99), 2)}`,
      allergies: rng.pick(ALLERGIES) ?? '',
      insuranceId: rng.chance(0.85) ? `SIM-${pad(rng.int(0, 999_999), 6)}` : '',
      createdAt,
      updatedAt: createdAt,
    });
  }
  return patients;
}

function noteBody(rng: GenerateContext['rng']): string {
  return [
    `Subjective: ${rng.pick(NOTE_PARTS.subjective)}.`,
    `Objective: ${rng.pick(NOTE_PARTS.objective)}.`,
    `Assessment: ${rng.pick(NOTE_PARTS.assessment)}.`,
    `Plan: ${rng.pick(NOTE_PARTS.plan)}.`,
    '(Fictional note generated for a prototype.)',
  ].join('\n');
}

export function generateClinicWorld(ctx: GenerateContext): WorldSeed {
  const { organization, personas, memberships } = identities(ctx);
  const opts = options(ctx);
  const ref = Date.parse(ctx.scenario.referenceTime);
  const orgCreated = Date.parse(organization.createdAt);
  const providers: Provider[] = PROVIDERS.map(({ hours: _hours, ...p }) => p);
  const availability: AvailabilityRule[] = PROVIDERS.flatMap((p) =>
    p.hours.flatMap((h) =>
      h.weekdays.map((weekday) => ({
        id: `avail_${p.id}_${weekday}`,
        providerId: p.id,
        weekday,
        startMinute: h.open * 60,
        endMinute: h.close * 60,
      }))
    )
  );

  const patients = opts.seed
    ? generatePatients(ctx, opts.patients, Math.max(orgCreated, ref - 400 * MS_PER_DAY), ref)
    : [];
  const appointments: Appointment[] = [];
  const notes: VisitNote[] = [];
  const audit: AuditEntry[] = [];

  if (patients.length > 0) {
    const slots = PROVIDERS.flatMap((p) =>
      p.hours.flatMap((h) =>
        schedule({
          ctx,
          resources: [p.id],
          window: { daysBefore: 14, daysAfter: 7 },
          businessHours: [h.open, h.close],
          openDays: h.weekdays,
          slotMinutes: 15,
          durations: [1, 2, 2, 3],
        })
      )
    ).sort((a, b) =>
      a.start < b.start ? -1 : a.start > b.start ? 1 : a.resourceId < b.resourceId ? -1 : 1
    );

    const rng = ctx.rng.fork('appointments');
    const noteRng = ctx.rng.fork('notes');
    const booked = new Map<string, { start: string; end: string }[]>();
    const desk = ['user_0001', 'user_0002'];
    for (const slot of slots) {
      if (!withinHours(availability, { ...slot, providerId: slot.resourceId })) continue;
      // A patient is never in two places at once: try a few patients, else leave the slot free.
      let patient: Patient | undefined;
      for (let attempt = 0; attempt < 4 && !patient; attempt++) {
        const candidate = rng.pick(patients) as Patient;
        if (!(booked.get(candidate.id) ?? []).some((b) => overlaps(b, slot))) patient = candidate;
      }
      if (!patient) continue;
      booked.set(patient.id, [...(booked.get(patient.id) ?? []), slot]);

      const id = ctx.ids.next('appointment');
      const start = Date.parse(slot.start);
      const end = Date.parse(slot.end);
      const createdMs = Math.max(
        Date.parse(patient.createdAt),
        Math.min(ref, start - rng.int(1, 21) * MS_PER_DAY)
      );
      const createdAt = new Date(createdMs).toISOString();
      const cancelled = rng.chance(0.06);
      const arrivedEarly = rng.int(0, 20);
      let status: Appointment['status'] = 'scheduled';
      let checkedInAt: string | null = null;
      if (cancelled) status = 'cancelled';
      else if (end <= ref) status = outcomeFor(ctx.scenario.seed, id);
      else if (start - CHECK_IN_OPENS_MINUTES * 60_000 <= ref && start <= ref + 15 * 60_000) {
        // Around now: a visit that has started is in progress; most patients due soon have arrived.
        if (start <= ref || rng.chance(0.6)) {
          status = 'checked-in';
          checkedInAt = new Date(Math.min(ref, start - arrivedEarly * 60_000)).toISOString();
        }
      }
      if (status === 'completed') {
        checkedInAt = new Date(start - arrivedEarly * 60_000).toISOString();
      }
      const createdBy = rng.pick(desk) ?? 'user_0002';
      const updatedAt = cancelled
        ? new Date(Math.min(ref, Math.max(createdMs, start - MS_PER_DAY))).toISOString()
        : (checkedInAt ?? createdAt);
      const appointment: Appointment = {
        id,
        patientId: patient.id,
        providerId: slot.resourceId,
        start: slot.start,
        end: slot.end,
        reason: rng.pick(VISIT_REASONS) ?? 'Follow-up',
        status,
        checkedInAt,
        cancelReason: cancelled ? (rng.pick(CANCEL_REASONS) ?? null) : null,
        createdBy,
        createdAt,
        updatedAt: updatedAt < createdAt ? createdAt : updatedAt,
      };
      appointments.push(appointment);
      audit.push({
        id: ctx.ids.next('audit'),
        action: 'appointment.booked',
        entity: 'appointment',
        entityId: id,
        patientId: patient.id,
        summary: `Booked ${patient.firstName} ${patient.lastName}`,
        changes: [],
        actorId: createdBy,
        at: createdAt,
      });

      if (status === 'completed') {
        const provider = providers.find((p) => p.id === slot.resourceId) as Provider;
        const authorId = provider.personaId ?? 'user_0003';
        // Visits of the last two days sometimes still wait for their note to be signed.
        const draft = ref - end < 2 * MS_PER_DAY && noteRng.chance(0.3);
        const written = new Date(Math.min(ref, end + noteRng.int(5, 90) * 60_000)).toISOString();
        const note: VisitNote = {
          id: ctx.ids.next('note'),
          appointmentId: id,
          patientId: patient.id,
          providerId: provider.id,
          authorId,
          body: noteBody(noteRng),
          signedAt: draft ? null : written,
          createdAt: written,
          updatedAt: written,
        };
        notes.push(note);
        if (!draft) {
          audit.push({
            id: ctx.ids.next('audit'),
            action: 'note.signed',
            entity: 'note',
            entityId: note.id,
            patientId: patient.id,
            summary: 'Signed a visit note',
            changes: [],
            actorId: authorId,
            at: written,
          });
        }
      }
    }
  }
  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { providers, availability, patients, appointments, notes, audit },
  };
}

/** The payload of an `appointment.ended` timeline event. */
export interface AppointmentEndedPayload {
  appointmentId: string;
  /** What a still-scheduled appointment becomes; a checked-in one always completes. */
  outcome: 'completed' | 'no-show';
}

/**
 * Simulated time: every scheduled or checked-in appointment that ends inside
 * the advanced window resolves. Checked-in visits complete (their note can
 * still be written); scheduled ones complete or become no-shows. The event id
 * and outcome depend only on the appointment, so one long advance equals many
 * short ones.
 */
export async function clinicTimeline(
  ctx: TimelineContext
): Promise<DomainEvent<AppointmentEndedPayload>[]> {
  const rows = (await ctx.read('appointments')) as unknown as Appointment[];
  const from = ctx.from.getTime();
  const to = ctx.to.getTime();
  return rows
    .filter(
      (a) =>
        (a.status === 'scheduled' || a.status === 'checked-in') &&
        Date.parse(a.end) > from &&
        Date.parse(a.end) <= to
    )
    .sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : a.id < b.id ? -1 : 1))
    .map((a) => ({
      id: `appointment-ended:${a.id}`,
      type: 'appointment.ended',
      at: a.end,
      payload: { appointmentId: a.id, outcome: outcomeFor(ctx.scenario.seed, a.id) },
      source: 'timeline' as const,
    }));
}
