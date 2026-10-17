import {
  type DatabaseVersion,
  definePolicy,
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
  type Row,
  type ScenarioInput,
} from '@protoyard/core';
import { dailyEvents, generateTeam } from '@protoyard/scenarios';
import type { Transaction } from 'dexie';

/**
 * A tiny but complete prototype used by the runtime tests: two related
 * domain tables, a policy, presets via `extends`, a deterministic timeline
 * and an event handler.
 */

export interface Project extends Row {
  id: string;
  name: string;
  organizationId: string;
  ownerId: string;
  createdAt: string;
}

export interface Task extends Row {
  id: string;
  projectId: string;
  assigneeId: string | null;
  title: string;
  status: 'todo' | 'doing' | 'done';
  createdAt: string;
}

export const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';

export const fixtureScenarios: ScenarioInput[] = [
  {
    id: 'active-month',
    extends: 'active-month',
    name: 'Active month',
    seed: 42,
    referenceTime: REFERENCE_TIME,
  },
  {
    id: 'viewer',
    extends: 'read-only-viewer',
    name: 'Viewer',
    seed: 7,
    referenceTime: REFERENCE_TIME,
  },
  {
    id: 'new-member',
    extends: 'six-month-new-member',
    name: 'New member',
    seed: 99,
    referenceTime: REFERENCE_TIME,
  },
  {
    id: 'empty',
    extends: 'brand-new-signup',
    name: 'Empty',
    seed: 1,
    referenceTime: REFERENCE_TIME,
  },
];

export const fixturePolicy = definePolicy({
  roles: {
    owner: ['*'],
    admin: ['*'],
    member: ['tasks:read', 'tasks:create', 'tasks:update'],
    viewer: ['tasks:read'],
  },
});

const STATUSES = ['todo', 'doing', 'done'] as const;

export function createTasksDefinition(
  options: {
    namespace?: string;
    id?: string;
    /** Adds a v2 that introduces `tasks.priority` and backfills it. */
    withV2?: boolean;
  } = {}
): PrototypeDefinition {
  const namespace = options.namespace ?? 'tasks-fixture';
  const versions: DatabaseVersion[] = [
    {
      version: 1,
      stores: { projects: 'id, organizationId, ownerId', tasks: 'id, projectId, status' },
    },
  ];
  if (options.withV2) {
    versions.push({
      version: 2,
      stores: { tasks: 'id, projectId, status, priority' },
      upgrade: async (tx) => {
        await (tx as Transaction)
          .table<Task, string>('tasks')
          .toCollection()
          .modify((task) => {
            task.priority = task.status === 'doing' ? 'high' : 'normal';
          });
      },
    });
  }

  return definePrototype({
    manifest: parseManifest({
      id: options.id ?? `example.${namespace}`,
      slug: namespace,
      name: 'Tasks fixture',
      version: '0.1.0',
      defaultScenario: 'active-month',
      defaultTheme: 'violet',
      storage: { namespace, schemaVersion: options.withV2 ? 2 : 1 },
      scenarios: fixtureScenarios.map((s) => s.id as string),
    }),
    database: { versions },
    scenarios: fixtureScenarios,
    policy: fixturePolicy,
    generatorVersion: 3,
    integrity: {
      relations: {
        projects: { ownerId: 'py_personas', organizationId: 'py_organizations' },
        tasks: { projectId: 'projects', assigneeId: 'py_personas' },
      },
      timestamps: { projects: ['createdAt'], tasks: ['createdAt'] },
    },
    generate(ctx) {
      const team = generateTeam(ctx);
      const projects: Project[] = Array.from({ length: ctx.scale(3) }, () => ({
        id: ctx.ids.next('project'),
        name: ctx.faker.commerce.productName(),
        organizationId: team.organization.id,
        ownerId: ctx.rng.pick(team.personas).id,
        createdAt: ctx.time
          .between(new Date(team.organization.createdAt), ctx.time.now, ctx.rng.next)
          .toISOString(),
      }));
      const tasks: Task[] = projects.flatMap((project) =>
        Array.from({ length: ctx.scale(5) }, () => ({
          id: ctx.ids.next('task'),
          projectId: project.id,
          assigneeId: ctx.rng.chance(0.2) ? null : ctx.rng.pick(team.personas).id,
          title: ctx.faker.hacker.phrase(),
          status: ctx.rng.pick(STATUSES),
          createdAt: ctx.time
            .between(new Date(project.createdAt), ctx.time.now, ctx.rng.next)
            .toISOString(),
        }))
      );
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships,
        tables: { projects, tasks },
      };
    },
    async timeline(ctx) {
      const projects = (await ctx.read('projects')) as Project[];
      if (projects.length === 0) return [];
      return dailyEvents(ctx, {
        perDay: ({ rng }) => rng.int(1, 3),
        make: ({ rng, at }) => ({
          type: 'task.created',
          payload: {
            projectId: rng.pick(projects.map((p) => p.id)),
            title: `Follow-up ${at.toISOString().slice(0, 16)}`,
          },
        }),
      });
    },
    async applyEvent(event, ctx) {
      if (event.type !== 'task.created') return;
      const payload = event.payload as { projectId: string; title: string };
      const task: Task = {
        id: `task_${event.id.replace(/[^A-Za-z0-9]/g, '_')}`,
        projectId: payload.projectId,
        assigneeId: null,
        title: payload.title,
        status: 'todo',
        createdAt: event.at,
      };
      await ctx.put('tasks', task);
    },
  });
}
