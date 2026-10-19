import { definePolicy } from '@protoyard/core';

export const CAPABILITIES = {
  coursesRead: 'courses:read',
  lessonsComplete: 'lessons:complete',
  quizzesSubmit: 'quizzes:submit',
  analyticsRead: 'analytics:read',
} as const;

export const policy = definePolicy({
  roles: {
    instructor: [CAPABILITIES.coursesRead, CAPABILITIES.analyticsRead],
    student: [CAPABILITIES.coursesRead, CAPABILITIES.lessonsComplete, CAPABILITIES.quizzesSubmit],
    viewer: [CAPABILITIES.coursesRead],
  },
});
