import { MS_PER_DAY, type WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type {
  Appointment,
  AuditEntry,
  AvailabilityRule,
  Patient,
  VisitNote,
} from '../src/database/schema.ts';
import {
  ageOn,
  checkInBlocker,
  freeSlots,
  mask,
  outcomeFor,
  overlaps,
  patientChanges,
  REDACTED,
  waitMinutes,
  withinHours,
} from '../src/domain/clinic.ts';
import { definition } from '../src/prototype.ts';
import { clinicTimeline, generateClinicWorld } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const world = (id: string) => generateClinicWorld(contextFor(id));
const rows = <T>(w: WorldSeed, table: string) => (w.tables[table] ?? []) as unknown as T[];
const REF = Date.parse('2026-10-14T13:00:00.000Z');
const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, day, h, m)).toISOString();

describe('clinic generator', () => {
  it('is deterministic for a seed and differs for another seed', () => {
    const a = world('active');
    expect(world('active')).toEqual(a);
    expect(generateClinicWorld(contextFor('active', 77)).tables.patients).not.toEqual(
      a.tables.patients
    );
  });

  it.each(definition.scenarios.map((s) => s.id))(
    '%s passes integrity and never double-books a provider or a patient',
    (id) => {
      const ctx = contextFor(id);
      const w = generateClinicWorld(ctx);
      expect(
        validateWorld(w, { ...definition.integrity, referenceTime: ctx.scenario.referenceTime })
      ).toEqual([]);
      expect(w.memberships.find((m) => m.personaId === ctx.scenario.actor.id)?.role).toBe(
        ctx.scenario.actor.role
      );
      const rules = rows<AvailabilityRule>(w, 'availability');
      const held = rows<Appointment>(w, 'appointments').filter((a) => a.status !== 'cancelled');
      const group = (key: (a: Appointment) => string) => {
        const map = new Map<string, Appointment[]>();
        for (const a of held) map.set(key(a), [...(map.get(key(a)) ?? []), a]);
        return map;
      };
      const byProvider = group((a) => a.providerId);
      const byPatient = group((a) => a.patientId);
      for (const a of held) {
        expect(withinHours(rules, a), a.id).toBe(true);
        for (const same of [byProvider.get(a.providerId), byPatient.get(a.patientId)]) {
          expect(
            same?.some((o) => o.id !== a.id && overlaps(o, a)),
            a.id
          ).toBe(false);
        }
      }
    }
  );

  it('generates only obviously fictional patients', () => {
    const patients = rows<Patient>(world('busy-clinic'), 'patients');
    expect(patients).toHaveLength(2000);
    expect(new Set(patients.map((p) => p.mrn)).size).toBe(2000);
    for (const p of patients) {
      expect(p.email).toMatch(/@example\.com$/);
      expect(p.phone).toMatch(/^\+1 555-01\d\d$/);
      expect(p.insuranceId).toMatch(/^(SIM-\d{6})?$/);
      expect(p.dateOfBirth <= '2026-10-14').toBe(true);
    }
  });

  it('resolves past visits, fills the waiting room and keeps the future scheduled', () => {
    const w = world('active');
    const appointments = rows<Appointment>(w, 'appointments');
    const notes = rows<VisitNote>(w, 'notes');
    expect(appointments.length).toBeGreaterThan(200);
    const live = appointments.filter((a) => a.status !== 'cancelled');
    const ended = live.filter((a) => Date.parse(a.end) <= REF);
    expect(ended.every((a) => a.status === 'completed' || a.status === 'no-show')).toBe(true);
    expect(ended.some((a) => a.status === 'no-show')).toBe(true);
    expect(
      live
        .filter((a) => Date.parse(a.start) > REF + 3_600_000)
        .every((a) => a.status === 'scheduled')
    ).toBe(true);
    expect(live.some((a) => a.status === 'checked-in')).toBe(true);
    // Every completed visit has a note; recent ones may still be unsigned drafts.
    const completed = new Set(live.filter((a) => a.status === 'completed').map((a) => a.id));
    expect(new Set(notes.map((n) => n.appointmentId))).toEqual(completed);
    expect(notes.some((n) => n.signedAt === null)).toBe(true);
    expect(notes.every((n) => !/[<>]/.test(n.body))).toBe(true);
  });

  it('never writes a sensitive value into the audit log', () => {
    const w = world('active');
    const audit = JSON.stringify(rows<AuditEntry>(w, 'audit'));
    for (const p of rows<Patient>(w, 'patients').slice(0, 50)) {
      for (const value of [p.dateOfBirth, p.phone, p.insuranceId].filter(Boolean)) {
        expect(audit.includes(value), value).toBe(false);
      }
    }
  });

  it('scales from an empty clinic to a busy one', () => {
    const empty = world('empty');
    expect(rows(empty, 'providers')).toHaveLength(3);
    expect(rows(empty, 'patients')).toHaveLength(0);
    expect(rows(empty, 'appointments')).toHaveLength(0);
    const busy = rows<Appointment>(world('busy-clinic'), 'appointments').length;
    expect(busy).toBeGreaterThan(rows<Appointment>(world('active'), 'appointments').length);
  });

  it('ends appointments on the timeline, window-independently', async () => {
    const ctx = contextFor('active');
    const appointments = rows<Appointment>(world('active'), 'appointments');
    const read = async () => appointments as never[];
    const from = new Date(REF);
    const plus = (d: number) => new Date(REF + d * MS_PER_DAY);
    const once = await clinicTimeline({ ...ctx, from, to: plus(3), read });
    const steps = [
      ...(await clinicTimeline({ ...ctx, from, to: plus(1), read })),
      ...(await clinicTimeline({ ...ctx, from: plus(1), to: plus(2), read })),
      ...(await clinicTimeline({ ...ctx, from: plus(2), to: plus(3), read })),
    ];
    expect(once.length).toBeGreaterThan(5);
    expect(steps).toEqual(once);
    expect(
      once.every(
        (e) => e.payload.outcome === outcomeFor(ctx.scenario.seed, e.payload.appointmentId)
      )
    ).toBe(true);
  });
});

describe('clinic rules', () => {
  const rules: AvailabilityRule[] = [
    { id: 'r', providerId: 'p', weekday: 4, startMinute: 9 * 60, endMinute: 12 * 60 },
  ];
  const appt = (start: string, end: string, status: Appointment['status'] = 'scheduled') =>
    ({ id: start, providerId: 'p', patientId: 'x', start, end, status }) as Appointment;

  it('checks hours on the UTC day and offers only free future slots', () => {
    expect(withinHours(rules, { providerId: 'p', start: at(15, 9), end: at(15, 10) })).toBe(true);
    expect(
      withinHours(rules, { providerId: 'p', start: at(15, 11, 30), end: at(15, 12, 15) })
    ).toBe(false);
    expect(withinHours(rules, { providerId: 'p', start: at(14, 9), end: at(14, 10) })).toBe(false);
    const slots = freeSlots({
      rules,
      appointments: [appt(at(15, 10), at(15, 11)), appt(at(15, 11), at(15, 12), 'cancelled')],
      providerId: 'p',
      day: '2026-10-15',
      durationMinutes: 60,
      now: new Date(at(15, 9, 10)),
      stepMinutes: 30,
    });
    expect(slots.map((s) => s.start)).toEqual([at(15, 11)]);
  });

  it('opens check-in an hour before and closes it at the end', () => {
    const a = appt(at(15, 10), at(15, 10, 30));
    expect(checkInBlocker(a, new Date(at(15, 8, 59)))).toMatch(/opens 60 minutes/);
    expect(checkInBlocker(a, new Date(at(15, 9)))).toBeNull();
    expect(checkInBlocker(a, new Date(at(15, 10, 30)))).toMatch(/ended/);
    expect(checkInBlocker({ ...a, status: 'checked-in' }, new Date(at(15, 10)))).toMatch(/Already/);
    expect(checkInBlocker({ ...a, status: 'cancelled' }, new Date(at(15, 10)))).toMatch(
      /Only scheduled/
    );
    expect(waitMinutes({ ...a, status: 'checked-in' }, new Date(at(15, 10, 25)))).toBe(25);
    expect(waitMinutes(a, new Date(at(15, 10, 25)))).toBe(0);
  });

  it('redacts sensitive fields in audit changes and masks without leaking length', () => {
    const before = { firstName: 'Ada', phone: '+1 555-0100', allergies: '' };
    const after = { firstName: 'Ada', phone: '+1 555-0142', allergies: 'Latex', lastName: 'Byron' };
    expect(patientChanges(before, after, ['firstName', 'lastName', 'phone', 'allergies'])).toEqual([
      { field: 'lastName', from: null, to: 'Byron' },
      { field: 'phone', from: REDACTED, to: REDACTED },
      { field: 'allergies', from: REDACTED, to: REDACTED },
    ]);
    expect(mask('Penicillin')).toBe(mask('Latex'));
    expect(mask('')).toBe('—');
  });

  it('computes ages on the simulated day', () => {
    const now = new Date(at(14, 13));
    expect(ageOn('2000-10-14', now)).toBe(26);
    expect(ageOn('2000-10-15', now)).toBe(25);
  });
});
