import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateCourseWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateCourseWorld,
  generatorVersion: 1,
  integrity: {
    relations: {
      courses: { instructorId: 'py_personas', cohortId: 'cohorts' },
      lessons: { courseId: 'courses' },
      enrollments: {
        courseId: 'courses',
        studentId: 'py_personas',
        cohortId: 'cohorts',
      },
      lessonProgress: {
        courseId: 'courses',
        lessonId: 'lessons',
        studentId: 'py_personas',
      },
      quizzes: { courseId: 'courses' },
      quizAttempts: { quizId: 'quizzes', studentId: 'py_personas' },
      cohortSessions: { cohortId: 'cohorts', courseId: 'courses' },
    },
  },
});
