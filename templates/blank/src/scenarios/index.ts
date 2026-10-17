import type { ScenarioInput } from '@protoyard/core';

/**
 * Scenarios are versioned, seeded worlds. Add one by appending an entry here
 * AND listing its id in protoyard.json → "scenarios". `generators.notes` is
 * a template-specific knob read by `generators.ts`.
 */

const referenceTime = '2026-10-16T09:00:00.000Z';

export const scenarios: ScenarioInput[] = [
  {
    id: 'empty',
    name: 'Brand-new workspace',
    description: 'The owner just signed up: no notes yet. Shows the empty state.',
    group: 'Lifecycle',
    seed: 101,
    referenceTime,
    density: 'empty',
    organization: { id: 'org_0001', name: 'Northwind Studio', ageDays: 0, size: 2 },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 0 },
    generators: { notes: 0 },
  },
  {
    id: 'active',
    name: 'Active owner',
    description: 'Three weeks in: a dozen notes, a few pinned, edited by both people.',
    group: 'Lifecycle',
    seed: 202,
    referenceTime,
    density: 'normal',
    organization: { id: 'org_0001', name: 'Northwind Studio', ageDays: 21, size: 2 },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 21 },
    generators: { notes: 12 },
  },
  {
    id: 'viewer',
    name: 'Read-only viewer',
    description:
      'Same world as “Active owner”, seen by a viewer who cannot create, edit or delete.',
    group: 'Roles',
    seed: 202,
    referenceTime,
    density: 'normal',
    organization: { id: 'org_0001', name: 'Northwind Studio', ageDays: 21, size: 2 },
    actor: { id: 'user_0002', role: 'viewer', joinedDaysAgo: 14 },
    generators: { notes: 12 },
  },
];
