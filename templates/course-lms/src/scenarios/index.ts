import type { ScenarioInput } from '@protoyard/core';

const referenceTime = '2026-10-19T13:00:00.000Z';
const organization = { id: 'org_0001', name: 'Fieldnote Academy', ageDays: 45, size: 4 };
const base = { referenceTime, organization };

export const scenarios: ScenarioInput[] = [
  {
    ...base,
    id: 'student-active',
    name: 'Learner in progress',
    description:
      'A student has access to the current course catalog and can track lesson progress.',
    group: 'Learning',
    seed: 4821,
    density: 'normal',
    actor: { id: 'user_0002', role: 'student', joinedDaysAgo: 21 },
    generators: { courses: 3, completedLessons: 0 },
    tags: ['default'],
  },
  {
    ...base,
    id: 'instructor-cohort',
    name: 'Instructor cohort review',
    description: 'An instructor reviews learner progress and the upcoming cohort schedule.',
    group: 'Teaching',
    seed: 4821,
    density: 'normal',
    actor: { id: 'user_0001', role: 'instructor', joinedDaysAgo: 45 },
    generators: { courses: 3, completedLessons: 1 },
  },
  {
    ...base,
    id: 'empty-catalog',
    name: 'New academy',
    description: 'An instructor has set up an academy, but has not published courses yet.',
    group: 'Lifecycle',
    seed: 90,
    density: 'empty',
    actor: { id: 'user_0001', role: 'instructor', joinedDaysAgo: 0 },
    organization: { ...organization, ageDays: 0 },
    generators: { courses: 0, completedLessons: 0 },
  },
  {
    ...base,
    id: 'network-offline',
    name: 'Learner offline',
    description:
      'Courses remain readable while lesson completion and quiz submission fail offline.',
    group: 'Conditions',
    seed: 4821,
    density: 'normal',
    actor: { id: 'user_0002', role: 'student', joinedDaysAgo: 21 },
    environment: { network: 'offline' },
    generators: { courses: 3, completedLessons: 0 },
  },
];
