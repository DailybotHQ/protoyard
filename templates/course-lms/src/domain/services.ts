import {
  createRuntimeId,
  type PrototypeRuntime,
  parseInput,
  ValidationError,
} from '@protoyard/core';
import { z } from 'zod';
import type { CourseLmsDatabase, LessonProgress, QuizAttempt } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

const LessonId = z.string().trim().min(1).max(100);
const SubmitQuizInput = z.object({
  quizId: z.string().trim().min(1).max(100),
  answers: z.record(z.string(), z.number().int().min(0).max(10)),
});
export type SubmitQuizInput = z.input<typeof SubmitQuizInput>;

export function createCourseServices(runtime: PrototypeRuntime<CourseLmsDatabase>) {
  const { db, session, environment, clock } = runtime;
  const studentId = () => {
    const id = session.principal()?.persona.id;
    if (!id) throw new Error('Load a student scenario before using course services.');
    return id;
  };

  return {
    lessons: {
      async complete(lessonId: string): Promise<LessonProgress> {
        session.assert(CAPABILITIES.lessonsComplete);
        const id = parseInput(LessonId, lessonId);
        return environment.run('lesson.complete', () =>
          db.transaction('rw', db.lessons, db.enrollments, db.lessonProgress, async () => {
            const lesson = await db.lessons.get(id);
            if (!lesson) throw new ValidationError({ lessonId: 'This lesson is unavailable.' });
            const actorId = studentId();
            const enrollment = await db.enrollments.get(`${lesson.courseId}:${actorId}`);
            if (!enrollment)
              throw new ValidationError({
                lessonId: 'Enroll in this course before completing lessons.',
              });
            const progressId = `${lesson.id}:${actorId}`;
            const existing = await db.lessonProgress.get(progressId);
            if (existing) return existing;
            const progress: LessonProgress = {
              id: progressId,
              courseId: lesson.courseId,
              lessonId: lesson.id,
              studentId: actorId,
              completedAt: clock.now().toISOString(),
            };
            await db.lessonProgress.add(progress);
            return progress;
          })
        );
      },
    },
    quizzes: {
      async submit(input: SubmitQuizInput): Promise<QuizAttempt> {
        session.assert(CAPABILITIES.quizzesSubmit);
        const parsed = parseInput(SubmitQuizInput, input);
        return environment.run('quiz.submit', () =>
          db.transaction('rw', db.quizzes, db.enrollments, db.quizAttempts, async () => {
            const quiz = await db.quizzes.get(parsed.quizId);
            if (!quiz) throw new ValidationError({ quizId: 'This quiz is unavailable.' });
            const actorId = studentId();
            const enrollment = await db.enrollments.get(`${quiz.courseId}:${actorId}`);
            if (!enrollment)
              throw new ValidationError({
                quizId: 'Enroll in this course before taking its quiz.',
              });
            if (
              quiz.questions.length === 0 ||
              quiz.questions.some((question) => {
                const answer = parsed.answers[question.id];
                return answer === undefined || answer < 0 || answer >= question.choices.length;
              })
            ) {
              throw new ValidationError({ answers: 'Answer every question before submitting.' });
            }
            const correct = quiz.questions.filter(
              (question) => parsed.answers[question.id] === question.correctIndex
            ).length;
            const score = Math.round((correct / quiz.questions.length) * 100);
            const attempt: QuizAttempt = {
              id: createRuntimeId('quiz_attempt'),
              quizId: quiz.id,
              studentId: actorId,
              answers: parsed.answers,
              score,
              passed: score >= quiz.passingScore,
              attemptedAt: clock.now().toISOString(),
            };
            await db.quizAttempts.add(attempt);
            return attempt;
          })
        );
      },
    },
  };
}
