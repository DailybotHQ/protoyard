import { PermissionDeniedError, type WorldSeed } from '@protoyard/core';
import { expandAll, RecurrenceRuleSchema } from '@protoyard/views/calendar';
import { SavedViewSchema } from '@protoyard/views/grid';
import { afterEach, describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { Dependency, Ritual, SavedView, Task, TaskDatabase } from '../src/database/schema.ts';
import { createTaskServices, UNASSIGNED_LANE, ValidationError } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';
import { generateTaskWorld } from '../src/scenarios/generators.ts';

/*
 * Keel Projects' flagship behavior on top of the template: the linked plan
 * (milestones, finish-to-start links), studio rituals, saved grid views,
 * swimlane moves, grid cell edits and mention notifications, plus the
 * massive scenario's shape. Services run on the real runtime.
 */

const contextFor = (id: string) => buildContext(definition.scenarios, id);
const rows = <T>(world: WorldSeed, table: string) => (world.tables[table] ?? []) as unknown as T[];

let harness = createHarness<TaskDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<TaskDatabase>(definition);
});

describe('keel-projects-demo world', () => {
  it('links each project into a plan: two tasks → milestone → two follow-ups, all links holding', () => {
    const world = generateTaskWorld(contextFor('sprint-in-flight'));
    const tasks = new Map(rows<Task>(world, 'tasks').map((t) => [t.id, t]));
    const links = rows<Dependency>(world, 'dependencies');
    const milestones = [...tasks.values()].filter((t) => t.milestone);
    expect(milestones).toHaveLength(3);
    expect(links).toHaveLength(12);
    for (const milestone of milestones) {
      expect(milestone.startDate).toBe(milestone.endDate);
      expect(links.filter((l) => l.toId === milestone.id)).toHaveLength(1);
      expect(links.filter((l) => l.fromId === milestone.id)).toHaveLength(2);
    }
    for (const link of links) {
      const from = tasks.get(link.fromId) as Task;
      const to = tasks.get(link.toId) as Task;
      expect(to.projectId).toBe(from.projectId);
      if (from.milestone) expect(to.startDate >= from.endDate).toBe(true);
      else expect(to.startDate > from.endDate).toBe(true);
    }
  });

  it('seeds studio rituals the calendar engine accepts, with one today', () => {
    const ctx = contextFor('sprint-in-flight');
    const world = generateTaskWorld(ctx);
    const rituals = rows<Ritual>(world, 'rituals');
    expect(rituals.map((r) => r.kind).sort()).toEqual([
      'critique',
      'planning',
      'retro',
      'review',
      'standup',
    ]);
    for (const ritual of rituals) {
      expect(() => RecurrenceRuleSchema.parse(ritual.rule)).not.toThrow();
      expect(ritual.end > ritual.start).toBe(true);
    }
    const today = ctx.scenario.referenceTime.slice(0, 10);
    const occurrences = expandAll(rituals, {
      start: `${today}T00:00:00.000Z`,
      end: `${today}T23:59:59.000Z`,
    });
    const titles = occurrences.occurrences.map(
      (o) => rituals.find((r) => r.id === o.seriesId)?.title
    );
    // Friday 2026-10-16: standup, the client review and the retro.
    expect(titles).toEqual(
      expect.arrayContaining(['Daily standup', 'Sprint review with clients', 'Sprint retro'])
    );
  });

  it('seeds valid saved views per person, the same whoever the scenario acts as', () => {
    const own = generateTaskWorld(contextFor('sprint-in-flight'));
    const viewer = generateTaskWorld(contextFor('viewer'));
    expect(rows(viewer, 'savedViews')).toEqual(rows(own, 'savedViews'));
    for (const view of rows<SavedView>(own, 'savedViews')) {
      expect(() =>
        SavedViewSchema.parse({ id: view.id, name: view.name, ...JSON.parse(view.state) })
      ).not.toThrow();
    }
  });

  it('massive: 4 × 2,500 tasks plus milestones, history only for the first tasks', () => {
    const world = generateTaskWorld(contextFor('massive'));
    const tasks = rows<Task>(world, 'tasks');
    expect(tasks).toHaveLength(10_004);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    expect(rows(world, 'activity').length).toBeLessThan(500);
    // Generated titles are numbered, so each project's backlog never repeats a title.
    for (const projectId of new Set(tasks.map((t) => t.projectId))) {
      const titles = tasks.filter((t) => t.projectId === projectId).map((t) => t.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });
});

describe('keel-projects-demo flagship services', () => {
  it('a swimlane drop reassigns (assignee lanes) or reprioritizes (priority lanes), with activity', async () => {
    const runtime = await harness.boot('sprint-in-flight');
    const services = createTaskServices(runtime);
    const task = (await runtime.db.tasks.toArray()).find(
      (t) => t.status === 'todo' && t.assigneeId !== 'user_0004'
    ) as Task;
    await services.tasks.reorder(
      { itemId: task.id, columnId: 'in-progress', index: 0, laneId: 'user_0004' },
      'assignee'
    );
    expect(await runtime.db.tasks.get(task.id)).toMatchObject({
      status: 'in-progress',
      assigneeId: 'user_0004',
    });
    await services.tasks.reorder(
      { itemId: task.id, columnId: 'in-progress', index: 0, laneId: UNASSIGNED_LANE },
      'assignee'
    );
    expect((await runtime.db.tasks.get(task.id))?.assigneeId).toBeNull();
    await services.tasks.reorder(
      { itemId: task.id, columnId: 'review', index: 0, laneId: 'urgent' },
      'priority'
    );
    expect(await runtime.db.tasks.get(task.id)).toMatchObject({
      status: 'review',
      priority: 'urgent',
    });
    const notes = (await runtime.db.activity.where('taskId').equals(task.id).toArray()).map(
      (a) => a.body
    );
    expect(notes).toEqual(
      expect.arrayContaining([
        'Assigned to Sam Ortiz',
        'Assigned to nobody',
        'Priority set to urgent',
      ])
    );
    await expect(
      services.tasks.reorder(
        { itemId: task.id, columnId: 'review', index: 0, laneId: 'user_0006' },
        'assignee'
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('edits title, status and priority from the grid, and refuses other columns', async () => {
    const runtime = await harness.boot('sprint-in-flight');
    const services = createTaskServices(runtime);
    const task = (await runtime.db.tasks.toArray()).find((t) => t.status === 'todo') as Task;
    await services.tasks.setField(task.id, 'title', '  Renamed from the grid ');
    await services.tasks.setField(task.id, 'priority', 'low');
    await services.tasks.setField(task.id, 'status', 'done');
    expect(await runtime.db.tasks.get(task.id)).toMatchObject({
      title: 'Renamed from the grid',
      priority: 'low',
      status: 'done',
      completedAt: runtime.clock.now().toISOString(),
    });
    await expect(services.tasks.setField(task.id, 'title', 'x')).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(services.tasks.setField(task.id, 'status', 'archived')).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      services.tasks.setField(task.id, 'assignee' as never, 'user_0002')
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rescheduling a milestone saves its shifted successors and refuses a broken link', async () => {
    const runtime = await harness.boot('sprint-in-flight');
    const services = createTaskServices(runtime);
    const milestone = (await runtime.db.tasks.toArray()).find((t) => t.milestone) as Task;
    const links = await runtime.db.dependencies.where('fromId').equals(milestone.id).toArray();
    const successors = (await runtime.db.tasks.bulkGet(links.map((l) => l.toId))) as Task[];
    const shift = (day: string, days: number) => {
      const d = new Date(`${day}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    // Alone, moving the milestone past its successors' starts breaks the links.
    await expect(
      services.tasks.reschedule([
        {
          id: milestone.id,
          start: shift(milestone.startDate, 3),
          end: shift(milestone.endDate, 3),
        },
      ])
    ).rejects.toBeInstanceOf(ValidationError);
    // With the cascade the timeline sends, everything saves together.
    await services.tasks.reschedule([
      { id: milestone.id, start: shift(milestone.startDate, 3), end: shift(milestone.endDate, 3) },
      ...successors.map((t) => ({
        id: t.id,
        start: shift(t.startDate, 3),
        end: shift(t.endDate, 3),
      })),
    ]);
    for (const successor of successors) {
      expect((await runtime.db.tasks.get(successor.id))?.startDate).toBe(
        shift(successor.startDate, 3)
      );
    }
  });

  it('applies calendar edits to rituals: move one series, split "following", delete', async () => {
    const runtime = await harness.boot('sprint-in-flight');
    const services = createTaskServices(runtime);
    const standup = (await runtime.db.rituals.toArray()).find(
      (r) => r.kind === 'standup'
    ) as Ritual;
    const later = (iso: string) => new Date(new Date(iso).getTime() + 15 * 60_000).toISOString();
    await services.rituals.apply({
      put: [
        {
          id: standup.id,
          start: later(standup.start),
          end: later(standup.end),
          rule: standup.rule,
        },
      ],
      delete: [],
    });
    expect((await runtime.db.rituals.get(standup.id))?.start).toBe(later(standup.start));
    // A "following" edit adds a series derived from the ritual's id.
    await services.rituals.apply({
      put: [{ id: `${standup.id}~2`, start: standup.start, end: standup.end, rule: standup.rule }],
      delete: [],
    });
    expect((await runtime.db.rituals.get(`${standup.id}~2`))?.title).toBe('Daily standup');
    await expect(
      services.rituals.apply({
        put: [{ id: 'ritual_unknown', start: standup.start, end: standup.end }],
        delete: [],
      })
    ).rejects.toThrow(/no longer exists/);
    await expect(
      services.rituals.apply({
        put: [{ id: standup.id, start: standup.end, end: standup.start }],
        delete: [],
      })
    ).rejects.toBeInstanceOf(ValidationError);
    await services.rituals.apply({ put: [], delete: [`${standup.id}~2`] });
    expect(await runtime.db.rituals.get(`${standup.id}~2`)).toBeUndefined();
  });

  it('saved views are personal: create, rename, delete, and unique names', async () => {
    const runtime = await harness.boot('sprint-in-flight');
    const services = createTaskServices(runtime);
    const before = await services.savedViews.list();
    expect(before.map((v) => v.name)).toEqual(['Urgent and high', 'Overdue']);
    const state = {
      columns: [],
      sort: [{ key: 'title', direction: 'asc' }],
      groupBy: 'status',
      filter: null,
      density: 'compact',
    };
    const view = await services.savedViews.create('By status', state);
    await expect(services.savedViews.create('by status', state)).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      services.savedViews.create('Broken', { ...state, density: 'tiny' })
    ).rejects.toBeInstanceOf(ValidationError);
    await services.savedViews.rename(view.id, 'Grouped by status');
    expect((await services.savedViews.list()).map((v) => v.name)).toContain('Grouped by status');
    await runtime.session.switchActor('user_0002');
    await expect(services.savedViews.rename(view.id, 'Not mine')).rejects.toThrow(
      /no longer exists/
    );
    await runtime.session.switchActor('user_0001');
    await services.savedViews.remove(view.id);
    expect(await services.savedViews.list()).toHaveLength(2);
  });

  it('a mention notifies the teammate, who sees it after a persona switch', async () => {
    const runtime = await harness.boot('sprint-in-flight');
    const services = createTaskServices(runtime);
    const task = (await runtime.db.tasks.toArray())[0] as Task;
    await services.comments.add(task.id, 'Can you take a look, @{user_0003}?');
    expect(await services.notifications.list()).toHaveLength(0);
    await runtime.session.switchActor('user_0003');
    const inbox = await services.notifications.list();
    expect(inbox[0]).toMatchObject({ kind: 'mention', subjectId: task.id, readAt: null });
    expect(inbox[0]?.title).toBe('Maya Chen mentioned you in a comment');
    expect(await services.notifications.markAllRead()).toBeGreaterThan(0);
  });

  it('a reply threads under its parent comment on the same task', async () => {
    const runtime = await harness.boot('sprint-in-flight');
    const services = createTaskServices(runtime);
    const [first, second] = (await runtime.db.tasks.toArray()) as [Task, Task];
    const parent = await services.comments.add(first.id, 'Top-level question');
    const reply = await services.comments.add(first.id, 'An answer', parent.id);
    expect((await runtime.db.comments.get(reply.id))?.parentId).toBe(parent.id);
    await expect(services.comments.add(second.id, 'Wrong task', parent.id)).rejects.toThrow(
      /no longer exists/
    );
  });

  it('the viewer cannot move rituals or save views', async () => {
    const runtime = await harness.boot('viewer');
    const services = createTaskServices(runtime);
    const ritual = (await runtime.db.rituals.toArray())[0] as Ritual;
    await expect(
      services.rituals.apply({
        put: [{ id: ritual.id, start: ritual.start, end: ritual.end }],
        delete: [],
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      services.savedViews.create('Mine', {
        columns: [],
        sort: [],
        groupBy: null,
        filter: null,
        density: 'comfortable',
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
