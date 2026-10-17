import type { ScenarioInput } from '@protoyard/core';

const referenceTime = '2026-10-16T09:00:00.000Z';

export const scenarios: ScenarioInput[] = [
  {
    id: 'default',
    name: 'Designer with favorites',
    description: 'A designer who starred a handful of components and patterns.',
    group: 'Personas',
    seed: 7,
    referenceTime,
    organization: { id: 'org_0001', name: 'Protoyard Design', ageDays: 60, size: 2 },
    actor: { id: 'user_0001', role: 'designer', joinedDaysAgo: 60 },
    generators: { favorites: 6 },
  },
  {
    id: 'dark-viewer',
    name: 'Viewer in dark mode',
    description: 'A read-only stakeholder who prefers dark mode: stars are visible but locked.',
    group: 'Personas',
    seed: 7,
    referenceTime,
    organization: { id: 'org_0001', name: 'Protoyard Design', ageDays: 60, size: 2 },
    actor: { id: 'user_0002', role: 'viewer', joinedDaysAgo: 10 },
    appearance: { mode: 'dark' },
    generators: { favorites: 6 },
  },
  {
    id: 'empty',
    name: 'First visit',
    description: 'No favorites yet — shows the empty states.',
    group: 'Lifecycle',
    seed: 11,
    referenceTime,
    density: 'empty',
    organization: { id: 'org_0001', name: 'Protoyard Design', ageDays: 0, size: 2 },
    actor: { id: 'user_0001', role: 'designer', joinedDaysAgo: 0 },
    generators: { favorites: 0 },
  },
];
