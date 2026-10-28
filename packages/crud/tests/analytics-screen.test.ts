import {
  createEntityServices,
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import { createBlueprintGenerator } from '@protoyard/blueprint/generator';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlueprintDefinition } from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { AnalyticsScreen } from '../src/screens/analytics/index.ts';
import {
  type AnalyticsScreenSpec,
  analyticsCsv,
  parseAnalyticsQuery,
  serializeAnalyticsQuery,
} from '../src/screens/analytics/model.ts';

const blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Harbor analytics',
  entities: [
    {
      name: 'request',
      plural: 'requests',
      fields: [
        { name: 'title', kind: 'text', required: true },
        {
          name: 'status',
          kind: 'enum',
          values: ['queued', 'done'],
          labels: { queued: 'Queued', done: 'Complete' },
          required: true,
        },
        { name: 'amount', kind: 'money', currency: 'USD', required: true },
      ],
      titleField: 'title',
      seedCount: 2,
    },
  ],
  screens: [
    {
      type: 'analytics',
      entity: 'request',
      title: 'Request analytics',
      dateField: 'createdAt',
      measures: [
        { label: 'Request count', aggregate: 'count' },
        { label: 'Gross amount', aggregate: 'sum', field: 'amount' },
      ],
      dimensions: ['status'],
    },
  ],
  roles: [
    { name: 'owner', permissions: { '*': ['*'] } },
    { name: 'viewer', permissions: { '*': ['read'] } },
  ],
});
const analyticsScreen = blueprint.screens.find(
  (candidate) => candidate.type === 'analytics'
) as AnalyticsScreenSpec;

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
let harness = createHarness(definition('crud-analytics'));
beforeEach(() => {
  seq += 1;
  harness = createHarness(definition(`crud-analytics-${seq}`));
  history.replaceState(null, '', '/#');
});
afterEach(() => {
  cleanup();
  harness.closeAll();
  vi.restoreAllMocks();
});

function show(runtime: Awaited<ReturnType<typeof harness.boot>>, query?: URLSearchParams) {
  return render(AnalyticsScreen, {
    runtime,
    blueprint,
    services: createEntityServices(runtime, blueprint),
    screen: analyticsScreen,
    query,
  });
}

describe('AnalyticsScreen', () => {
  it('recomputes by measure and dimension and round-trips state through the hash query', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, blueprint);
    const seeded = await services.request!.list();
    const latest = seeded
      .map((row) => String(row.createdAt))
      .sort()
      .at(-1);
    if (latest) runtime.clock.setTime(new Date(Date.parse(latest) + 1_000));
    show(runtime);

    expect(await screen.findByRole('button', { name: 'Export CSV' })).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: 'Show data table' }, { timeout: 10_000 })
    ).toBeTruthy();
    const measure = screen.getByLabelText('Measure');
    await fireEvent.change(measure, { target: { value: '1' } });
    await waitFor(() => expect(location.hash).toContain('measure=1'));

    // The breakdown is Texuli's accessible select: open it, then choose the option.
    await fireEvent.click(await screen.findByRole('combobox', { name: 'Break down by' }));
    await fireEvent.click(await screen.findByRole('option', { name: /status/i }));
    await waitFor(() => expect(location.hash).toContain('dimension=status'));
    const reloaded = parseAnalyticsQuery(
      new URLSearchParams(location.hash.split('?')[1]),
      analyticsScreen
    );
    expect(reloaded.measure).toBe(1);
    expect(reloaded.dimension).toBe('status');
    expect(screen.getAllByRole('heading', { name: 'Gross amount' }).length).toBeGreaterThan(0);
  });

  it('hides CSV export from a persona without export capability', async () => {
    const runtime = await harness.boot('viewer');
    show(runtime);

    await screen.findByRole('button', { name: 'Show data table' }, { timeout: 10_000 });
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
  });

  it('keeps hash state parts and safely serializes aggregate CSV cells', () => {
    const state = parseAnalyticsQuery(
      '?measure=1&dimension=status&range=last-7-days&compare=previous-year&by=day',
      analyticsScreen
    );
    const query = serializeAnalyticsQuery(state, new URLSearchParams('scenario=busy'));
    expect(query.get('scenario')).toBe('busy');
    expect(parseAnalyticsQuery(query, analyticsScreen)).toMatchObject({
      measure: 1,
      dimension: 'status',
    });
    const csv = analyticsCsv(
      [
        {
          bucket: '2026-01-02T00:00:00.000Z',
          dimension: '=HYPERLINK("bad")',
          value: 4,
          records: 1,
        },
      ],
      blueprint.entities[0] ??
        (() => {
          throw new RangeError('missing test entity');
        })(),
      'status'
    );
    expect(csv).toContain('\'=HYPERLINK(""bad"")');
    const signed = analyticsCsv(
      [{ bucket: "-1+cmd|' /C calc'!A0", dimension: null, value: -5, records: 1 }],
      blueprint.entities[0] ??
        (() => {
          throw new RangeError('missing test entity');
        })(),
      null
    );
    expect(signed).toContain('"\'-1+cmd|');
    expect(signed).toContain('"-5"');
  });
});
