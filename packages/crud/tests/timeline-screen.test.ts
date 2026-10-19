import {
  type Blueprint,
  createEntityServices,
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import { createBlueprintGenerator } from '@protoyard/blueprint/generator';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlueprintDefinition } from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  groupTimelineRows,
  rowToTimelineTask,
  TimelineScreen,
  type TimelineScreenSpec,
} from '../src/screens/timeline/index.ts';

const blueprint: Blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Harbor projects',
  entities: [
    {
      name: 'project',
      plural: 'projects',
      fields: [
        { name: 'title', kind: 'text', required: true },
        { name: 'startsOn', kind: 'date', required: true },
        { name: 'endsOn', kind: 'date' },
        {
          name: 'status',
          kind: 'enum',
          values: ['planned', 'active', 'done'],
          labels: { planned: 'Planned', active: 'In progress', done: 'Complete' },
          required: true,
        },
      ],
      titleField: 'title',
      seedCount: 1,
    },
  ],
  roles: [
    { name: 'owner', permissions: { '*': ['*'] } },
    { name: 'viewer', permissions: { '*': ['read'] } },
  ],
});
const entity = blueprint.entities[0]!;
const spec = {
  type: 'timeline',
  entity: 'project',
  startField: 'startsOn',
  endField: 'endsOn',
  groupBy: 'status',
  zoom: 'month',
} as TimelineScreenSpec;

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

let sequence = 0;
let harness = createHarness(definition('crud-timeline'));
beforeEach(() => {
  sequence += 1;
  harness = createHarness(definition(`crud-timeline-${sequence}`));
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

describe('TimelineScreen', () => {
  it('groups and orders records deterministically and maps missing ends to milestones', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, blueprint);
    await services.project!.create({ title: 'Later', startsOn: '2026-06-04', status: 'active' });
    await services.project!.create({ title: 'Alpha', startsOn: '2026-06-02', status: 'planned' });
    await services.project!.create({
      title: 'Beta',
      startsOn: '2026-06-02',
      endsOn: '2026-06-05',
      status: 'planned',
    });
    const rows = (await services.project!.list()).filter((row) =>
      ['Later', 'Alpha', 'Beta'].includes(String(row.title))
    );
    const groups = groupTimelineRows(rows, entity, spec);

    expect(groups.map(({ label }) => label)).toEqual(['Planned', 'In progress']);
    expect(groups[0]?.tasks.map(({ title }) => title)).toEqual(['Alpha', 'Beta']);
    expect(groups[0]?.tasks[0]?.milestone).toBe(true);
    expect(groups[0]?.tasks[1]?.milestone).toBeUndefined();
    expect(
      rowToTimelineTask(rows.find((row) => row.title === 'Alpha')!, entity, spec)
    ).toMatchObject({
      start: '2026-06-02',
      end: '2026-06-02',
      milestone: true,
    });

    render(TimelineScreen, { runtime, blueprint, services, screen: spec });
    expect(await screen.findByRole('heading', { name: 'Planned' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Alpha, June 2, 2026 to June 2, 2026, milestone/ })
    ).toBeTruthy();
  });

  it('persists keyboard rescheduling through the entity service', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, blueprint);
    const created = await services.project!.create({
      title: 'Dock renewal',
      startsOn: '2026-06-02',
      endsOn: '2026-06-04',
      status: 'active',
    });
    render(TimelineScreen, { runtime, blueprint, services, screen: spec });

    const task = await screen.findByRole('button', { name: /Dock renewal, June 2/ });
    await fireEvent.keyDown(task, { key: ' ' });
    await fireEvent.keyDown(task, { key: 'ArrowRight' });
    await fireEvent.keyDown(task, { key: 'Enter' });
    await waitFor(async () =>
      expect(await services.project!.get(String(created.id))).toMatchObject({
        startsOn: '2026-06-03',
        endsOn: '2026-06-05',
      })
    );
  });

  it('offers one-week menu shifts that persist through the entity service', async () => {
    const runtime = await harness.boot('owner');
    const services = createEntityServices(runtime, blueprint);
    const created = await services.project!.create({
      title: 'Pier inspection',
      startsOn: '2026-06-02',
      endsOn: '2026-06-04',
      status: 'active',
    });
    render(TimelineScreen, { runtime, blueprint, services, screen: spec });
    await screen.findByRole('heading', { name: 'In progress' });
    const taskName = screen
      .getAllByText('Pier inspection')
      .find((element) => element.closest('li')) as HTMLElement;
    const menu = taskName.closest('details') as HTMLDetailsElement;
    await fireEvent.click(menu.querySelector('summary') as HTMLElement);
    await fireEvent.click(within(menu).getByRole('button', { name: 'Later' }));
    await waitFor(async () =>
      expect(await services.project!.get(String(created.id))).toMatchObject({
        startsOn: '2026-06-09',
        endsOn: '2026-06-11',
      })
    );
  });

  it('renders a read-only timeline for a viewer', async () => {
    const runtime = await harness.boot('viewer');
    const services = createEntityServices(runtime, blueprint);
    render(TimelineScreen, { runtime, blueprint, services, screen: spec });
    const task = await screen.findByRole('button', { name: /,/ });
    await fireEvent.keyDown(task, { key: ' ' });
    await fireEvent.keyDown(task, { key: 'ArrowRight' });
    expect(screen.queryByText(/Picked up/)).toBeNull();
    expect(task.getAttribute('aria-pressed')).toBe('false');
  });
});
