import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

export type Course = {
  id: string;
  title: string;
  description: string;
  instructorId: string;
  cohortId: string;
  published: boolean;
};
export type Lesson = {
  id: string;
  courseId: string;
  title: string;
  body: string;
  order: number;
};
export type Cohort = { id: string; name: string; startDate: string; endDate: string };
export type Enrollment = {
  id: string;
  courseId: string;
  studentId: string;
  cohortId: string;
  enrolledAt: string;
};
export type LessonProgress = {
  id: string;
  courseId: string;
  lessonId: string;
  studentId: string;
  completedAt: string;
};
export type QuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
};
export type Quiz = {
  id: string;
  courseId: string;
  title: string;
  passingScore: number;
  questions: QuizQuestion[];
};
export type QuizAttempt = {
  id: string;
  quizId: string;
  studentId: string;
  answers: Record<string, number>;
  score: number;
  passed: boolean;
  attemptedAt: string;
};
export type CohortSession = {
  id: string;
  cohortId: string;
  courseId: string;
  start: string;
  end: string;
  durationMinutes: number;
  status: 'past' | 'in-progress' | 'upcoming';
};

export type CourseLmsDatabase = Dexie & {
  courses: EntityTable<Course, 'id'>;
  lessons: EntityTable<Lesson, 'id'>;
  cohorts: EntityTable<Cohort, 'id'>;
  enrollments: EntityTable<Enrollment, 'id'>;
  lessonProgress: EntityTable<LessonProgress, 'id'>;
  quizzes: EntityTable<Quiz, 'id'>;
  quizAttempts: EntityTable<QuizAttempt, 'id'>;
  cohortSessions: EntityTable<CohortSession, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        courses: 'id, instructorId, cohortId, published',
        lessons: 'id, courseId, order, [courseId+order]',
        cohorts: 'id, startDate',
        enrollments: 'id, courseId, studentId, cohortId, [courseId+studentId]',
        lessonProgress: 'id, courseId, lessonId, studentId, [lessonId+studentId]',
        quizzes: 'id, courseId',
        quizAttempts: 'id, quizId, studentId, attemptedAt',
        cohortSessions: 'id, cohortId, courseId, start',
      },
    },
  ],
};
