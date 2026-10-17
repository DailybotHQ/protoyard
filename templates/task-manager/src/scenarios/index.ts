import type { ScenarioInput } from '@protoyard/core';
import { composeScenario, fragments, presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds composed from the shared presets in
 * @protoyard/scenarios. Add one by appending an entry here AND listing its id
 * in protoyard.json → "scenarios". `generators.tasks` holds the knobs read by
 * `generators.ts` (see `TaskGeneratorOptions`).
 */

export const REFERENCE_TIME = '2026-10-16T09:00:00.000Z';

/** Knobs the generator reads from `scenario.generators.tasks`. */
export interface TaskGeneratorOptions {
  /** How many projects to create (max 4). */
  projects: number;
  /** Tasks per project, inclusive range. */
  tasksPerProject: [number, number];
  /** Share of OPEN tasks whose due date is already in the past (0..1). */
  overdueShare: number;
  /** Optional persona who gets a bigger share of assignments (3×). */
  focusAssignee?: string;
}

const ORGANIZATION = { id: 'org_0001', name: 'Brightline Studio' };

const shared = {
  seed: 3107,
  referenceTime: REFERENCE_TIME,
  organization: ORGANIZATION,
};

/** Week three of a six-person team: the world the other role scenarios reuse. */
const activeTeam = presetScenario(
  'active-month',
  shared,
  fragments.accountAge(21),
  fragments.organizationSize(6),
  {
    id: 'active-team',
    name: 'Active team, week 3',
    description:
      'Six people three weeks in: three projects, a busy board, comments and a few tasks slipping.',
    group: 'Lifecycle',
    actor: { id: 'user_0001', role: 'owner', onboardingComplete: true },
    generators: { tasks: { projects: 3, tasksPerProject: [10, 14], overdueShare: 0.12 } },
    tags: ['default'],
  }
);

export const scenarios: ScenarioInput[] = [
  presetScenario('brand-new-signup', shared, {
    id: 'empty',
    name: 'Brand-new workspace',
    description: 'The owner just signed up: no projects or tasks yet. Shows every empty state.',
    organization: { size: 1 },
    actor: { id: 'user_0001', role: 'owner' },
    generators: { tasks: { projects: 0, tasksPerProject: [0, 0], overdueShare: 0 } },
  }),
  activeTeam,
  presetScenario('active-month', shared, fragments.accountAge(45), fragments.organizationSize(6), {
    id: 'overdue-crunch',
    name: 'Overdue crunch',
    description:
      'Launch week gone wrong: most open tasks are past due (relative to the simulated clock). Seen by Priya, a member who can edit tasks but delete only her own.',
    group: 'Conditions',
    density: 'dense',
    activity: { level: 'intense' },
    actor: { id: 'user_0003', role: 'member', joinedDaysAgo: 40, onboardingComplete: true },
    generators: {
      tasks: {
        projects: 4,
        tasksPerProject: [12, 16],
        overdueShare: 0.7,
        focusAssignee: 'user_0003',
      },
    },
  }),
  composeScenario(activeTeam, {
    id: 'viewer',
    name: 'Read-only viewer',
    description:
      'The “Active team” world seen by Theo, a client stakeholder: every create, edit, move and delete is blocked in the UI and in services.',
    group: 'Roles',
    actor: { id: 'user_0006', role: 'viewer', joinedDaysAgo: 14 },
    tags: ['roles'],
  }),
];
