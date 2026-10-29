import { expect, type Page, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

/**
 * The clinic template against its STATIC production build (served by
 * `protoyard preview`, DevTools excluded). Each test gets a fresh browser
 * context, so a fresh IndexedDB. The runtime handle (`window.__protoyard`)
 * reads rows for setup; behavior is asserted through the UI.
 *
 * Simulated "now" is Wednesday 2026-10-14 13:00 UTC in every scenario.
 */
const SLUG = 'clinic';
test.skip(!PROTOTYPE_TARGETS.includes(SLUG), `set PROTOYARD_E2E_PROTOTYPES to include ${SLUG}`);

type Row = Record<string, unknown>;
type Runtime = {
  data: { rows(table: string, o?: { limit?: number; offset?: number }): Promise<Row[]> };
};
declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

const TODAY = '2026-10-14';
const PROVIDERS: Record<string, string> = {
  prov_tan: 'Dr. Mei Tan · Family medicine',
  prov_osei: 'Dr. Kwame Osei · Pediatrics',
  prov_rivera: 'Lucía Rivera, NP · Nurse practitioner',
};

async function openApp(page: Page, hash: string, scenario = 'active') {
  await page.goto(`${prototypeUrl(SLUG)}?scenario=${scenario}${hash}`);
  await waitForPrototypeReady(page, { slug: SLUG });
}
/** Every row of a table (the inspector API pages its reads, 50 rows by default). */
const rows = (page: Page, table: string) =>
  page.evaluate(async (t) => {
    const all: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 200) {
      const chunk = (await window.__protoyard?.data.rows(t, { limit: 200, offset })) ?? [];
      all.push(...chunk);
      if (chunk.length < 200) return all;
    }
  }, table);

const holds = (a: Row) => a.status === 'scheduled' || a.status === 'checked-in';
const overlaps = (a: Row, start: string, end: string) =>
  String(a.start) < end && start < String(a.end);
const iso = (h: number, m: number) =>
  `${TODAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
const label = (h: number, m: number) =>
  `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;

/** Picks a ui Select option in the dialog (the trigger is a combobox named by its label). */
async function choose(page: Page, field: string, option: string) {
  await page.getByRole('dialog').getByRole('combobox', { name: field, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Searches a patient in the booking dialog and selects them. */
async function pickPatient(page: Page, name: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Patient').fill(name);
  await dialog
    .getByRole('list', { name: 'Matching patients' })
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .first()
    .click();
}

/** Clicks a sidebar section link; on phones it first opens the drawer. */
async function navTo(page: Page, name: string) {
  const link = page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name });
  if (!(await link.isVisible()))
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await link.click();
}

test.describe('Clinic template (static build)', () => {
  test('the front desk books a patient into a free slot today and checks them in', async ({
    page,
  }, testInfo) => {
    await openApp(page, '#/');
    await expect(page.getByRole('note', { name: 'Simulation notice' })).toContainText(
      'no HIPAA or other compliance claim'
    );
    const [appointments, patients] = await Promise.all([
      rows(page, 'appointments'),
      rows(page, 'patients'),
    ]);
    // A patient with nothing today, and the first 15-minute slot a provider has free within check-in's hour.
    const busyToday = new Set(
      appointments.filter((a) => String(a.start).startsWith(TODAY)).map((a) => a.patientId)
    );
    const patient = patients.find((p) => !busyToday.has(p.id));
    if (!patient) throw new Error('the active scenario has a patient with no appointment today');
    let pick: { providerId: string; h: number; m: number } | undefined;
    for (const providerId of Object.keys(PROVIDERS)) {
      for (const [h, m] of [
        [13, 15],
        [13, 30],
        [13, 45],
        [14, 0],
      ] as const) {
        const start = iso(h, m);
        const end = new Date(Date.parse(start) + 15 * 60_000).toISOString();
        if (
          !appointments.some(
            (a) => a.providerId === providerId && holds(a) && overlaps(a, start, end)
          )
        ) {
          pick ??= { providerId, h, m };
        }
      }
    }
    if (!pick) throw new Error('some provider has a free quarter hour this afternoon');
    const name = `${patient.firstName} ${patient.lastName}`;

    await page.getByRole('button', { name: 'Book appointment' }).click();
    const dialog = page.getByRole('dialog');
    await pickPatient(page, name);
    await choose(page, 'Provider', PROVIDERS[pick.providerId] as string);
    await dialog.getByLabel('Start (UTC)').fill(iso(pick.h, pick.m).slice(11, 16));
    await choose(page, 'Length', '15 min');
    await dialog.getByRole('button', { name: 'Book appointment' }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByRole('listitem', { name: `${label(pick.h, pick.m)} ${name}` });
    await expect(row).toContainText('Scheduled');
    await row.getByRole('button', { name: 'Check in' }).click();
    await expect(row).toContainText('Checked in');
    await expect(row.getByRole('button', { name: 'Check in' })).toHaveCount(0);
    await expectAccessible(page, testInfo, { include: 'main', label: 'front-desk' });

    await page.reload();
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(
      page.getByRole('listitem', { name: `${label(pick.h, pick.m)} ${name}` })
    ).toContainText('Checked in');
    const mine = (await rows(page, 'appointments')).filter(
      (a) => a.patientId === patient.id && String(a.start) === iso(pick.h, pick.m)
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      status: 'checked-in',
      providerId: pick.providerId,
      createdBy: 'user_0002',
    });
    const audit = (await rows(page, 'audit'))
      .filter((e) => e.entityId === mine[0]?.id)
      .map((e) => e.action);
    expect(audit.sort()).toEqual(['appointment.booked', 'appointment.checked_in']);
  });

  test('booking a busy provider shows the conflict inline and writes nothing', async ({
    page,
  }, testInfo) => {
    await openApp(page, '#/');
    const [appointments, patients] = await Promise.all([
      rows(page, 'appointments'),
      rows(page, 'patients'),
    ]);
    const taken = appointments
      .filter((a) => a.providerId === 'prov_tan' && holds(a) && String(a.start) > `${TODAY}T14:00`)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))[0];
    const patient = patients.find(
      (p) =>
        !appointments.some(
          (a) =>
            a.patientId === p.id &&
            holds(a) &&
            taken &&
            overlaps(a, String(taken.start), String(taken.end))
        )
    );
    if (!taken || !patient)
      throw new Error('the active scenario has an upcoming appointment for Dr. Tan');

    await page.getByRole('button', { name: 'Book appointment' }).click();
    const dialog = page.getByRole('dialog');
    await pickPatient(page, `${patient.firstName} ${patient.lastName}`);
    await choose(page, 'Provider', PROVIDERS.prov_tan as string);
    await dialog.getByLabel('Date (UTC)').fill(String(taken.start).slice(0, 10));
    await dialog.getByLabel('Start (UTC)').fill(String(taken.start).slice(11, 16));
    await choose(page, 'Length', '15 min');
    await dialog.getByRole('button', { name: 'Book appointment' }).click();
    await expect(dialog.getByText(/Dr\. Mei Tan already has an appointment at/)).toBeVisible();
    await expect(dialog).toBeVisible();
    expect((await rows(page, 'appointments')).length).toBe(appointments.length);
    await expectAccessible(page, testInfo, {
      include: '[role="dialog"]',
      label: 'booking-conflict',
    });
  });

  test('sensitive details stay masked until revealed, and the audit records the view without values', async ({
    page,
  }) => {
    await openApp(page, '#/patients');
    const patient = (await rows(page, 'patients'))[0];
    if (!patient) throw new Error('the active scenario has patients');
    await page.goto(`${prototypeUrl(SLUG)}?scenario=active#/patients/${patient.id}`);
    await waitForPrototypeReady(page, { slug: SLUG });
    const phone = page.locator('[data-sensitive="phone"]');
    await expect(phone).toContainText('••••••');
    await expect(page.locator('[data-patient-details]')).not.toContainText(String(patient.phone));
    await page.getByRole('button', { name: 'Reveal sensitive details' }).click();
    await expect(phone).toContainText(String(patient.phone));
    await page.getByRole('button', { name: 'Hide sensitive details' }).click();
    await expect(phone).toContainText('••••••');

    const entries = (await rows(page, 'audit')).filter(
      (e) => e.patientId === patient.id && e.action === 'patient.revealed'
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorId: 'user_0002' });
    expect(JSON.stringify(entries)).not.toContain(String(patient.phone));
    // The front desk cannot read visit notes.
    await expect(
      page
        .getByRole('note')
        .filter({ hasText: 'Visit notes are visible to clinicians and admins only' })
    ).toBeVisible();
  });

  test('the treating clinician writes and signs a plain-text note, which completes the visit', async ({
    page,
  }, testInfo) => {
    await openApp(page, '#/', 'clinician');
    const visit = (await rows(page, 'appointments')).find(
      (a) => a.providerId === 'prov_tan' && a.status === 'checked-in'
    );
    if (!visit) throw new Error('the clinician scenario has a checked-in patient for Dr. Tan');
    await page.goto(`${prototypeUrl(SLUG)}?scenario=clinician#/visits/${visit.id}`);
    await waitForPrototypeReady(page, { slug: SLUG });
    const body = 'Subjective: <b>cough</b> for 3 days.\nPlan: rest and fluids.';
    await page.getByLabel('Note (plain text)').fill(body);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await expectAccessible(page, testInfo, { include: 'main', label: 'visit-note' });
    // On a phone the toast sits over the note's buttons: dismiss it as a person would.
    await page.getByRole('button', { name: 'Dismiss notification: Draft saved' }).click();
    await page.getByRole('button', { name: 'Sign note' }).click();
    await expect(page.getByText(/^Signed /)).toBeVisible();
    // Shown as typed: the markup is text, not an element.
    await expect(page.locator('[data-note-body]')).toContainText('<b>cough</b>');
    await expect(page.locator('[data-note-body] b')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign note' })).toHaveCount(0);

    await page.reload();
    await waitForPrototypeReady(page, { slug: SLUG });
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
    const note = (await rows(page, 'notes')).find((n) => n.appointmentId === visit.id);
    expect(note).toMatchObject({ body, authorId: 'user_0003' });
    expect(note?.signedAt).toBeTruthy();
    expect(JSON.stringify(await rows(page, 'audit'))).not.toContain('cough');
  });

  test('the read-only reviewer sees masked details, no notes and no actions', async ({
    page,
  }, testInfo) => {
    await openApp(page, '#/', 'viewer');
    await expect(page.getByRole('heading', { name: 'Front desk' })).toBeVisible();
    await expect(page.locator('[data-front-desk-list]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Book appointment' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check in' })).toHaveCount(0);
    await navTo(page, 'Patients');
    await page.getByRole('row').nth(1).click();
    await expect(page.locator('[data-sensitive="dateOfBirth"]')).toContainText('••••••');
    await expect(page.getByRole('button', { name: 'Reveal sensitive details' })).toHaveCount(0);
    await expect(
      page.getByRole('note').filter({ hasText: 'Your role cannot reveal sensitive details' })
    ).toBeVisible();
    await navTo(page, 'Audit log');
    await expect(page.getByRole('table')).toBeVisible();
    await expectAccessible(page, testInfo, { include: 'main', label: 'viewer-audit' });
  });
});
