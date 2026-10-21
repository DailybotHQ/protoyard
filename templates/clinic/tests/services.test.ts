import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { ClinicDatabase } from '../src/database/schema.ts';
import { REDACTED } from '../src/domain/clinic.ts';
import { createServices } from '../src/domain/services.ts';
import { ValidationError } from '../src/domain/validation.ts';
import { definition } from '../src/prototype.ts';

/**
 * Domain tests on the REAL runtime with an in-memory IndexedDB. `reload()`
 * closes the runtime and opens a new one on the same storage, like a page
 * reload, so these prove persistence, not just in-memory state.
 */

let harness = createHarness<ClinicDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<ClinicDatabase>(definition);
});

// The reference time is Wednesday 2026-10-14 13:00 UTC. Dr. Tan works Mon–Fri 08–16.
const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, day, h, m)).toISOString();
const slot = (h: number, m = 0, minutes = 30, day = 15) => ({
  start: at(day, h, m),
  end: new Date(Date.parse(at(day, h, m)) + minutes * 60_000).toISOString(),
});
const ada = {
  firstName: 'Ada',
  lastName: 'Example',
  dateOfBirth: '1990-04-12',
  email: 'ada.example@example.com',
  phone: '+1 555-0142',
  allergies: 'Penicillin',
  insuranceId: 'SIM-123456',
};
const issues = (e: unknown) => (e instanceof ValidationError ? e.issues : {});

describe('clinic services on the real runtime', () => {
  it('registers a patient, books, refuses overlaps and checks in, surviving reloads', async () => {
    let runtime = await harness.boot('empty');
    let services = createServices(runtime);
    const patient = await services.patients.create(ada);
    expect(patient.mrn).toBe('MRN-000001');
    const other = await services.patients.create({
      ...ada,
      firstName: 'Alan',
      email: 'alan@example.com',
    });

    // 13:30 today: in the future and inside check-in's one-hour window.
    const visit = await services.appointments.book({
      patientId: patient.id,
      providerId: 'prov_tan',
      reason: 'Follow-up',
      ...slot(13, 30, 30, 14),
    });
    expect(visit).toMatchObject({ status: 'scheduled', createdBy: 'user_0001' });

    // The provider is busy 13:30–14:00; 14:00 touches it and is fine (half-open spans).
    const busy = await services.appointments
      .book({
        patientId: other.id,
        providerId: 'prov_tan',
        reason: 'New concern',
        ...slot(13, 45, 30, 14),
      })
      .catch((e: unknown) => e);
    expect(issues(busy).start).toMatch(/Dr\. Mei Tan already has an appointment/);
    // The patient cannot be in two rooms at once.
    const twice = await services.appointments
      .book({
        patientId: patient.id,
        providerId: 'prov_osei',
        reason: 'Vaccination',
        ...slot(13, 30, 30, 14),
      })
      .catch((e: unknown) => e);
    expect(issues(twice).patientId).toMatch(/Ada Example already has an appointment/);
    await services.appointments.book({
      patientId: other.id,
      providerId: 'prov_tan',
      reason: 'Lab review',
      ...slot(14, 0, 30, 14),
    });

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    const checked = await services.appointments.checkIn(visit.id);
    expect(checked.status).toBe('checked-in');
    await expect(services.appointments.checkIn(visit.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(services.appointments.cancel(visit.id)).rejects.toBeInstanceOf(ValidationError);

    runtime = await harness.reload(runtime);
    expect(await runtime.db.appointments.get(visit.id)).toMatchObject({
      status: 'checked-in',
      checkedInAt: at(14, 13),
    });
    expect((await runtime.db.audit.toArray()).map((a) => a.action).sort()).toEqual([
      'appointment.booked',
      'appointment.booked',
      'appointment.checked_in',
      'patient.created',
      'patient.created',
    ]);
  });

  it('refuses times outside the hours, in the past, off the grid, and real-looking contacts', async () => {
    const runtime = await harness.boot('empty');
    const services = createServices(runtime);
    const patient = await services.patients.create(ada);
    const book = (input: Partial<Parameters<typeof services.appointments.book>[0]>) =>
      services.appointments
        .book({
          patientId: patient.id,
          providerId: 'prov_tan',
          reason: 'Checkup',
          ...slot(9),
          ...input,
        })
        .catch((e: unknown) => issues(e));
    expect((await book(slot(16))).start).toMatch(/outside Dr\. Mei Tan's hours/);
    expect((await book(slot(9, 0, 30, 14))).start).toMatch(/future/);
    expect((await book({ start: at(15, 9, 10), end: at(15, 9, 40) })).start).toMatch(/15-minute/);
    expect((await book({ providerId: 'prov_osei', ...slot(9, 0, 30, 16) })).start).toMatch(/hours/); // Osei: Mon–Thu
    expect(await runtime.db.appointments.count()).toBe(0);

    const register = (input: Partial<typeof ada>) =>
      services.patients.create({ ...ada, ...input }).catch((e: unknown) => issues(e));
    expect((await register({ email: 'ada@hospital.example' })).email).toMatch(/example\.com/);
    expect((await register({ phone: '+1 212-555-7788' })).phone).toMatch(/555-01xx/);
    expect((await register({ insuranceId: 'BCBS-998877' })).insuranceId).toMatch(/SIM-/);
    expect((await register({ dateOfBirth: '2030-01-01' })).dateOfBirth).toMatch(/future/);
    expect(await runtime.db.patients.count()).toBe(1);
  });

  it('records which fields changed and who looked, never the sensitive values', async () => {
    const runtime = await harness.boot('empty');
    const services = createServices(runtime);
    const patient = await services.patients.create(ada);
    await services.patients.update(patient.id, {
      ...ada,
      lastName: 'Lovelace',
      phone: '+1 555-0177',
    });
    const revealed = await services.patients.reveal(patient.id);
    expect(revealed).toEqual({
      dateOfBirth: '1990-04-12',
      phone: '+1 555-0177',
      allergies: 'Penicillin',
      insuranceId: 'SIM-123456',
    });
    // Simulated time is frozen, so the three entries share one timestamp: compare as a set.
    const audit = await runtime.db.audit.where('patientId').equals(patient.id).toArray();
    expect(audit.map((a) => a.action).sort()).toEqual([
      'patient.created',
      'patient.revealed',
      'patient.updated',
    ]);
    expect(audit.find((a) => a.action === 'patient.updated')?.changes).toEqual([
      { field: 'lastName', from: 'Example', to: 'Lovelace' },
      { field: 'phone', from: REDACTED, to: REDACTED },
    ]);
    const text = JSON.stringify(audit);
    for (const secret of ['1990-04-12', '0142', '0177', 'Penicillin', 'SIM-123456']) {
      expect(text.includes(secret), secret).toBe(false);
    }
  });

  it('lets only the treating clinician write and sign the note, which then completes the visit', async () => {
    const runtime = await harness.boot('clinician'); // Dr. Mei Tan
    const services = createServices(runtime);
    const mine = await runtime.db.appointments
      .filter((a) => a.status === 'checked-in' && a.providerId === 'prov_tan')
      .first();
    const theirs = await runtime.db.appointments
      .filter((a) => a.status === 'completed' && a.providerId !== 'prov_tan')
      .first();
    if (!mine || !theirs) throw new Error('the clinician scenario has visits for every provider');

    expect(
      issues(await services.notes.save(theirs.id, { body: 'x' }).catch((e: unknown) => e)).body
    ).toMatch(/Only/);
    await expect(services.notes.sign(mine.id)).rejects.toBeInstanceOf(ValidationError); // nothing saved yet
    const body = 'Subjective: <b>cough</b> for 3 days.\nPlan: rest.';
    await services.notes.save(mine.id, { body });
    const signed = await services.notes.sign(mine.id);
    expect(signed).toMatchObject({ body, authorId: 'user_0003', signedAt: at(14, 13) });
    expect((await runtime.db.appointments.get(mine.id))?.status).toBe('completed');
    expect(
      issues(await services.notes.save(mine.id, { body: 'edit' }).catch((e: unknown) => e)).body
    ).toMatch(/signed/);

    // Clinicians do not run the front desk.
    await expect(
      services.appointments.book({
        patientId: mine.patientId,
        providerId: 'prov_tan',
        reason: 'x',
        ...slot(9),
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    const audit = JSON.stringify(
      await runtime.db.audit.where('entityId').equals(signed.id).toArray()
    );
    expect(audit).not.toContain('cough');
  });

  it('keeps notes away from the front desk and everything away from the viewer, and writes nothing offline', async () => {
    const runtime = await harness.boot('viewer');
    const services = createServices(runtime);
    const patient = await runtime.db.patients.toCollection().first();
    const upcoming = await runtime.db.appointments.filter((a) => a.status === 'scheduled').first();
    if (!patient || !upcoming) throw new Error('the viewer scenario has patients and appointments');
    const before = await runtime.db.audit.count();
    for (const attempt of [
      services.patients.create(ada),
      services.patients.reveal(patient.id),
      services.appointments.checkIn(upcoming.id),
      services.appointments.cancel(upcoming.id),
      services.notes.save(upcoming.id, { body: 'x' }),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(PermissionDeniedError);
    }
    await runtime.session.switchActor('user_0002'); // front desk
    await expect(services.notes.save(upcoming.id, { body: 'x' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(services.patients.create(ada)).rejects.toBeInstanceOf(SimulatedServiceError);
    expect(await runtime.db.audit.count()).toBe(before);
  });

  it('resolves appointments when simulated time advances', async () => {
    const runtime = await harness.boot('active');
    const open = await runtime.db.appointments
      .filter((a) => (a.status === 'scheduled' || a.status === 'checked-in') && a.end <= at(15, 0))
      .toArray();
    expect(open.some((a) => a.status === 'checked-in')).toBe(true);
    await runtime.scenarios.advance({ days: 1 });
    for (const a of open) {
      const next = (await runtime.db.appointments.get(a.id))?.status;
      if (a.status === 'checked-in') expect(next).toBe('completed');
      else expect(['completed', 'no-show']).toContain(next);
    }
  });

  it('loads every scenario', async () => {
    for (const id of definition.manifest.scenarios) {
      const runtime = await harness.boot(id);
      expect(await runtime.db.providers.count(), id).toBe(3);
      harness.closeAll();
      harness = createHarness<ClinicDatabase>(definition);
    }
  }, 60_000);
});
