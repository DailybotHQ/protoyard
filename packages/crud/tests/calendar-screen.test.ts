import {
  type Blueprint,
  createEntityServices,
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import { createBlueprintGenerator } from '@protoyard/blueprint/generator';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlueprintDefinition } from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  CalendarScreen,
  type CalendarScreenSpec,
  prefillFor,
  reschedulePatch,
  rowToSeries,
  toneFor,
} from '../src/screens/calendar/index.ts';

/** A fictional harbor tour desk: timed bookings and all-day dock closures. */
const blueprint: Blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Harbor tours',
  entities: [
    {
      name: 'booking',
      plural: 'bookings',
      fields: [
        { name: 'title', kind: 'text', required: true },
        { name: 'startsAt', kind: 'datetime', required: true },
        { name: 'endsAt', kind: 'datetime' },
        { name: 'status', kind: 'enum', values: ['requested', 'confirmed', 'done'] },
      ],
      titleField: 'title',
      seedCount: 2,
    },
    {
      name: 'closure',
      plural: 'closures',
      fields: [
        { name: 'reason', kind: 'text', required: true },
        { name: 'firstDay', kind: 'date', required: true },
        { name: 'lastDay', kind: 'date' },
      ],
      titleField: 'reason',
      seedCount: 1,
    },
  ],
  roles: [
    { name: 'owner', permissions: { '*': ['*'] } },
    { name: 'admin', permissions: { '*': ['*'] } },
    { name: 'member', permissions: { '*': ['read', 'create', 'update'] } },
    { name: 'viewer', permissions: { '*': ['read'] } },
  ],
});
const booking = blueprint.entities[0]!;
const closure = blueprint.entities[1]!;
const bookingScreen = {
  type: 'calendar',
  entity: 'booking',
  dateField: 'startsAt',
  endField: 'endsAt',
  colorBy: 'status',
  view: 'week',
} as CalendarScreenSpec;
const closureScreen = {
  type: 'calendar',
  entity: 'closure',
  dateField: 'firstDay',
  endField: 'lastDay',
  view: 'week',
} as CalendarScreenSpec;

function definition(namespace: string) {
  const base = createBlueprintDefinition(namespace);
  const generator = createBlueprintGenerator(blueprint);
  return {
    ...base,
    database: { versions: [{ version: 1, stores: deriveStores(blueprint) }] },
    policy: derivePolicy(blueprint),
    integrity: deriveIntegrity(blueprint),
    generate: generator.generate,
  };
}

let seq = 0;
let harness = createHarness(definition('crud-calendar'));
beforeEach(() => {
  seq += 1;
  harness = createHarness(definition(`crud-calendar-${seq}`));
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

const table = (runtime: PrototypeRuntime, name: string) =>
  (runtime.db as { table(name: string): { toArray(): Promise<Row[]> } }).table(name);

async function boot(scenario = 'owner') {
  const runtime = await harness.boot(scenario);
  const services = createEntityServices(runtime, blueprint);
  return { runtime, services };
}

function show(
  runtime: PrototypeRuntime,
  services: ReturnType<typeof createEntityServices>,
  spec: CalendarScreenSpec = bookingScreen
) {
  return render(CalendarScreen, {
    runtime,
    blueprint,
    services,
    screen: spec,
    onOpenRecord: () => {},
  });
}

const eventButton = (name: RegExp) => screen.findAllByRole('button', { name });

describe('CalendarScreen', () => {
  it('puts records on the right UTC day: timed bookings in day columns, closures all day', async () => {
    const { runtime, services } = await boot();
    // The scenario clock is 2026-06-01 09:00 UTC (Monday): the en-US week is May 31 – Jun 6.
    await services.booking!.create({
      title: 'Night harbor tour',
      startsAt: '2026-06-02T23:30:00.000Z',
      endsAt: '2026-06-03T00:30:00.000Z',
      status: 'confirmed',
    });
    show(runtime, services);
    const [tour] = await eventButton(/^Night harbor tour/);
    expect(tour?.closest('[data-day-column]')?.getAttribute('data-day-column')).toBe('2026-06-02');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('May 31 – Jun 6, 2026');
    cleanup();

    await services.closure!.create({
      reason: 'Dock repairs',
      firstDay: '2026-06-03',
      lastDay: '2026-06-04',
    });
    show(runtime, services, closureScreen);
    const repairs = await eventButton(/^Dock repairs, All day/);
    expect(repairs.map((b) => b.closest('[data-allday]')?.getAttribute('data-allday'))).toEqual([
      '2026-06-03',
      '2026-06-04',
    ]);
  });

  it('reschedules through the entity service and the change survives a reload', async () => {
    const { runtime, services } = await boot();
    const created = await services.booking!.create({
      title: 'Lighthouse walk',
      startsAt: '2026-06-02T10:00:00.000Z',
      endsAt: '2026-06-02T11:00:00.000Z',
    });
    show(runtime, services);
    const [walk] = await eventButton(/^Lighthouse walk/);
    // Texuli Space-grab: the held chip is marked data-grabbed + aria-pressed.
    const grabbed = () =>
      document.querySelector('[data-grabbed][aria-pressed="true"]') as HTMLElement;
    await fireEvent.keyDown(walk as HTMLElement, { key: ' ' });
    await waitFor(() => expect(grabbed()).toBeTruthy());
    for (let i = 0; i < 4; i++) {
      await fireEvent.keyDown(grabbed(), { key: 'ArrowDown' });
    }
    await fireEvent.keyDown(grabbed(), { key: 'Enter' });
    await waitFor(async () =>
      expect(await services.booking!.get(created.id as string)).toMatchObject({
        startsAt: '2026-06-02T11:00:00.000Z',
        endsAt: '2026-06-02T12:00:00.000Z',
      })
    );
    const again = createEntityServices(await harness.reload(runtime), blueprint);
    expect((await again.booking!.get(created.id as string))?.startsAt).toBe(
      '2026-06-02T11:00:00.000Z'
    );
  });

  it('opens the create form prefilled from an empty slot and creates the record', async () => {
    const { runtime, services } = await boot();
    show(runtime, services);
    await waitFor(() => expect(document.querySelector('[data-slot][data-focused]')).toBeTruthy());
    await fireEvent.click(document.querySelector('[data-slot][data-focused]') as HTMLElement);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('New booking')).toBeTruthy();
    const form = dialog.querySelector('[data-entity-form="booking"]') as HTMLFormElement;
    const inputs = form.querySelectorAll('input');
    // Title, then the prefilled start (09:00 on today) and end (10:00).
    expect((inputs[1] as HTMLInputElement).value).toBe('2026-06-01T09:00');
    expect((inputs[2] as HTMLInputElement).value).toBe('2026-06-01T10:00');
    await fireEvent.input(inputs[0] as HTMLInputElement, { target: { value: 'Morning kayak' } });
    await fireEvent.submit(form);

    await waitFor(async () => {
      const rows = await table(runtime, 'bookings').toArray();
      expect(rows.find((r) => r.title === 'Morning kayak')).toMatchObject({
        startsAt: '2026-06-01T09:00:00.000Z',
        endsAt: '2026-06-01T10:00:00.000Z',
      });
    });
    expect(await eventButton(/^Morning kayak/)).toHaveLength(1);
  });

  it('follows the simulated clock: time travel moves Today and the now-line', async () => {
    const { runtime, services } = await boot();
    show(runtime, services);
    await waitFor(() => expect(document.querySelector('[data-now-line]')).toBeTruthy());
    runtime.clock.setTime('2026-06-10T12:00:00.000Z');
    await waitFor(() => expect(document.querySelector('[data-now-line]')).toBeNull());
    await fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Jun 7 – Jun 13, 2026')
    );
    expect(document.querySelector('[data-now-line]')).toBeTruthy();
  });

  it('is read-only for a viewer: no drag, no create', async () => {
    const { runtime, services } = await boot('viewer');
    show(runtime, services);
    // Readiness: query ready + Texuli calendar chrome (no create slots when onCreate is off).
    await waitFor(() =>
      expect(
        document.querySelector('[data-query-state="ready"] section[data-calendar]')
      ).toBeTruthy()
    );
    expect(document.querySelector('[data-slot]')).toBeNull();
    expect(document.querySelectorAll('[data-movable]')).toHaveLength(0);
    expect(document.querySelectorAll('[aria-roledescription="draggable event"]')).toHaveLength(0);
    const day = document.querySelector('[data-day-column]') as HTMLElement;
    expect(day).toBeTruthy();
    await fireEvent.click(day);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a color legend for colorBy', async () => {
    const { runtime, services } = await boot();
    show(runtime, services);
    const legend = await screen.findByRole('list', { name: 'Colors by status' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent?.trim())
    ).toEqual(['requested', 'confirmed', 'done']);
  });
});

describe('calendar screen model', () => {
  it('maps date and datetime rows, skipping rows without a date', () => {
    const allDay = rowToSeries(
      { id: 'c1', reason: 'Storm', firstDay: '2026-06-03', lastDay: '2026-06-05' } as Row,
      closure,
      closureScreen,
      'UTC'
    );
    expect(allDay).toMatchObject({ start: '2026-06-03', end: '2026-06-06', allDay: true });
    // Generated data stores ISO instants for date fields: shown on their civil day in the zone.
    expect(
      rowToSeries(
        { id: 'c2', reason: 'Fog', firstDay: '2026-06-03T23:00:00.000Z' } as Row,
        closure,
        closureScreen,
        'Asia/Tokyo'
      )
    ).toMatchObject({ start: '2026-06-04', end: '2026-06-05' });
    expect(
      rowToSeries(
        { id: 'b1', title: 'Tour', startsAt: '2026-06-02T10:00:00.000Z', endsAt: null } as Row,
        booking,
        bookingScreen,
        'UTC'
      )
    ).toMatchObject({ start: '2026-06-02T10:00:00.000Z', end: '2026-06-02T11:00:00.000Z' });
    expect(
      rowToSeries(
        { id: 'b2', title: 'No date', startsAt: null } as Row,
        booking,
        bookingScreen,
        'UTC'
      )
    ).toBeNull();
  });

  it('turns a move into a patch and a slot into a prefill', () => {
    expect(
      reschedulePatch(closure, closureScreen, { start: '2026-06-10', end: '2026-06-12' })
    ).toEqual({
      firstDay: '2026-06-10',
      lastDay: '2026-06-11',
    });
    expect(
      reschedulePatch(booking, bookingScreen, {
        start: '2026-06-02T11:00:00.000Z',
        end: '2026-06-02T12:00:00.000Z',
      })
    ).toEqual({ startsAt: '2026-06-02T11:00:00.000Z', endsAt: '2026-06-02T12:00:00.000Z' });
    expect(
      prefillFor(closure, closureScreen, {
        date: '2026-06-09',
        start: '2026-06-09',
        end: '2026-06-10',
        allDay: true,
      })
    ).toEqual({ firstDay: '2026-06-09', lastDay: '2026-06-09' });
    expect(toneFor(booking.fields[3], 'done')).toBe('success');
    expect(toneFor(booking.fields[3], 'unknown')).toBe('neutral');
    expect(toneFor(undefined, 'x')).toBe('primary');
  });
});
