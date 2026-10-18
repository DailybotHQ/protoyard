import type { ScenarioInput } from '@protoyard/core';

/**
 * Scenarios are versioned, seeded worlds that extend shared presets. Add one
 * by appending an entry here AND listing its id in protoyard.json →
 * "scenarios". Knobs read by `generators.ts`: `agents` (how many library
 * agents to seed), `runsPerAgent` and `evaluations` (seed one evaluation per
 * dataset).
 */

const referenceTime = '2026-10-16T09:00:00.000Z';
const organization = { name: 'Lumen Labs' };

export const scenarios: ScenarioInput[] = [
  {
    id: 'empty',
    extends: 'brand-new-signup',
    name: 'Fresh console',
    description: 'A brand-new workspace with no agents yet: shows every empty state.',
    seed: 101,
    referenceTime,
    organization,
    actor: { role: 'owner' },
    generators: { agents: 0, runsPerAgent: 0, evaluations: false },
  },
  {
    id: 'active',
    extends: 'active-month',
    name: 'Active platform',
    description: 'Three agents with a month of playground runs, datasets and evaluations.',
    seed: 202,
    referenceTime,
    organization,
    actor: { role: 'owner' },
    generators: { agents: 3, runsPerAgent: 6, evaluations: true },
  },
  {
    id: 'member',
    extends: 'six-month-new-member',
    name: 'Builder',
    description: 'A builder who can create agents, run them and evaluate, but not delete agents.',
    seed: 303,
    referenceTime,
    organization,
    actor: { role: 'member' },
    generators: { agents: 3, runsPerAgent: 4, evaluations: true },
  },
  {
    id: 'viewer',
    extends: 'read-only-viewer',
    name: 'Read-only viewer',
    description: 'Same platform, seen by a stakeholder who can read traces and dashboards only.',
    seed: 202,
    referenceTime,
    organization,
    actor: { role: 'viewer' },
    generators: { agents: 3, runsPerAgent: 6, evaluations: true },
  },
  {
    id: 'tool-outage',
    extends: 'active-month',
    name: 'Tool outage',
    description:
      'History is healthy, but every NEW tool call fails (failure scope ai.agent.tool.): playground runs and evaluations show failed steps.',
    seed: 202,
    referenceTime,
    organization,
    actor: { role: 'owner' },
    environment: { failureMode: 'server-error', failureRate: 1, failureScope: ['ai.agent.tool.'] },
    generators: { agents: 3, runsPerAgent: 6, evaluations: true },
    tags: ['failure'],
  },
];
