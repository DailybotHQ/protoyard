import { parseScenario, type WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type { Activity, Comment, Project, Task } from '../src/database/schema.ts';
import { dueState } from '../src/domain/tasks.ts';
import { definition } from '../src/prototype.ts';
import { generateTaskWorld } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const rows = <T>(world: WorldSeed, table: string) => (world.tables[table] ?? []) as unknown as T[];

describe('keel-projects-demo generator', () => {
  it('is deterministic for the same seed and differs for another seed', () => {
    const a = generateTaskWorld(contextFor('sprint-in-flight'));
    const b = generateTaskWorld(contextFor('sprint-in-flight'));
    expect(a).toEqual(b);
    const c = generateTaskWorld(contextFor('sprint-in-flight', 99));
    expect(c.tables.tasks).not.toEqual(a.tables.tasks);
  });

  it('passes the integrity rules for every scenario', () => {
    for (const input of definition.scenarios) {
      const ctx = contextFor(input.id);
      const world = generateTaskWorld(ctx);
      const violations = validateWorld(world, {
        ...definition.integrity,
        referenceTime: ctx.scenario.referenceTime,
      });
      expect(violations, input.id).toEqual([]);
      expect(world.personas.some((p) => p.id === ctx.scenario.actor.id)).toBe(true);
      const membership = world.memberships.find((m) => m.personaId === ctx.scenario.actor.id);
      expect(membership?.role).toBe(ctx.scenario.actor.role);
    }
  });

  it('keeps domain invariants: viewers own nothing, keys are unique, done ⇔ completedAt', () => {
    for (const input of definition.scenarios) {
      const world = generateTaskWorld(contextFor(input.id));
      const viewers = new Set(
        world.memberships.filter((m) => m.role === 'viewer').map((m) => m.personaId)
      );
      const tasks = rows<Task>(world, 'tasks');
      for (const task of tasks) {
        expect(viewers.has(task.reporterId)).toBe(false);
        if (task.assigneeId) expect(viewers.has(task.assigneeId)).toBe(false);
        expect(task.status === 'done').toBe(task.completedAt !== null);
        expect(task.updatedAt >= task.createdAt).toBe(true);
      }
      for (const comment of rows<Comment>(world, 'comments')) {
        expect(viewers.has(comment.authorId)).toBe(false);
      }
      const keys = rows<Project>(world, 'projects').map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
      const numbers = tasks.map((t) => `${t.projectId}#${t.number}`);
      expect(new Set(numbers).size).toBe(numbers.length);
      // An imported backlog (massive) has history only for its first tasks.
      const withHistory = input.id === 'massive' ? 4 * 12 : tasks.length;
      expect(rows<Activity>(world, 'activity').length).toBeGreaterThanOrEqual(withHistory);
    }
  });

  it('shapes each scenario: empty, active, overdue crunch and the same world for the viewer', () => {
    const empty = generateTaskWorld(contextFor('empty'));
    expect(rows(empty, 'projects')).toHaveLength(0);
    expect(rows(empty, 'tasks')).toHaveLength(0);
    expect(empty.personas).toHaveLength(1);

    const active = generateTaskWorld(contextFor('sprint-in-flight'));
    expect(rows(active, 'projects')).toHaveLength(3);
    expect(rows(active, 'tasks').length).toBeGreaterThanOrEqual(30);

    const viewer = generateTaskWorld(contextFor('viewer'));
    expect(rows<Project>(viewer, 'projects')).toHaveLength(
      rows<Project>(active, 'projects').length
    );
    expect(rows<Task>(viewer, 'tasks')).toHaveLength(rows<Task>(active, 'tasks').length);

    const crunchCtx = contextFor('overdue-crunch');
    const crunch = generateTaskWorld(crunchCtx);
    const now = new Date(crunchCtx.scenario.referenceTime);
    const open = rows<Task>(crunch, 'tasks').filter((t) => t.status !== 'done');
    const overdue = open.filter((t) => dueState(t, now) === 'overdue');
    expect(overdue.length / open.length).toBeGreaterThan(0.5);
    expect(overdue.filter((t) => t.assigneeId === 'user_0003').length).toBeGreaterThanOrEqual(5);
    const activeNow = new Date(parseScenario(definition.scenarios[1] ?? {}).referenceTime);
    const activeOverdue = rows<Task>(active, 'tasks').filter(
      (t) => dueState(t, activeNow) === 'overdue'
    );
    expect(activeOverdue.length).toBeLessThan(overdue.length);
  });
});
