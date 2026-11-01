import type { ScenarioInput } from '@protoyard/core';

/**
 * Scenarios are versioned, seeded worlds. Add one by appending an entry here
 * AND listing its id in protoyard.json → "scenarios". `generators.boards`
 * (how many boards) and `generators.boardLevel` (the first board's content:
 * typical, dense or edge) are read by `generators.ts`.
 */

const referenceTime = '2026-10-16T09:00:00.000Z';
const organization = { id: 'org_0001', name: 'Northwind Studio', ageDays: 21, size: 2 };

export const scenarios: ScenarioInput[] = [
  {
    id: 'empty',
    name: 'Brand-new workspace',
    description: 'The owner just signed up: no boards yet. Shows the empty state.',
    group: 'Lifecycle',
    seed: 101,
    referenceTime,
    density: 'empty',
    organization: { ...organization, ageDays: 0 },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 0 },
    generators: { boards: 0 },
  },
  {
    id: 'active',
    name: 'Active owner',
    description: 'Three weeks in: three planning boards of frames, sticky notes and connectors.',
    group: 'Lifecycle',
    seed: 202,
    referenceTime,
    density: 'normal',
    organization,
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 21 },
    generators: { boards: 3, boardLevel: 'typical' },
  },
  {
    id: 'crowded',
    name: 'Crowded board',
    description:
      'The first board holds 1,500 sticky notes: pan, zoom, the minimap and the shape list.',
    group: 'Scale',
    seed: 303,
    referenceTime,
    density: 'dense',
    organization,
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 21 },
    generators: { boards: 2, boardLevel: 'dense' },
  },
  {
    id: 'awkward',
    name: 'Awkward shapes',
    description:
      'Nested frames, a rotated and a locked note, a long note, and connectors to a free point and between frames.',
    group: 'Edge cases',
    seed: 404,
    referenceTime,
    density: 'normal',
    organization,
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 21 },
    generators: { boards: 1, boardLevel: 'edge' },
  },
  {
    id: 'viewer',
    name: 'Read-only viewer',
    description: 'Same world as “Active owner”, seen by a viewer who can look but not edit.',
    group: 'Roles',
    seed: 202,
    referenceTime,
    density: 'normal',
    organization,
    actor: { id: 'user_0002', role: 'viewer', joinedDaysAgo: 14 },
    generators: { boards: 3, boardLevel: 'typical' },
  },
];
