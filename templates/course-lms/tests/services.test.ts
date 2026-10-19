import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { CourseLmsDatabase } from '../src/database/schema.ts';
import { createCourseServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

let harness = createHarness<CourseLmsDatabase>(definition);
afterEach(() => harness.closeAll());
const fresh = () => {
  harness = createHarness<CourseLmsDatabase>(definition);
};

describe('course LMS student services', () => {
  it('persists lesson completion and grades a passing quiz', async () => {
    fresh();
    let runtime = await harness.boot('student-active');
    const services = createCourseServices(runtime);
    const course = (await runtime.db.courses.get('course_research'))!;
    const lesson = (await runtime.db.lessons.where('courseId').equals(course.id).first())!;
    const quiz = (await runtime.db.quizzes.where('courseId').equals(course.id).first())!;

    const progress = await services.lessons.complete(lesson.id);
    const answers = Object.fromEntries(
      quiz.questions.map((question) => [question.id, question.correctIndex])
    );
    const attempt = await services.quizzes.submit({ quizId: quiz.id, answers });
    expect(progress.completedAt).toBe(runtime.clock.now().toISOString());
    expect(attempt).toMatchObject({ score: 100, passed: true });

    runtime = await harness.reload(runtime);
    expect(await runtime.db.lessonProgress.get(`${lesson.id}:user_0002`)).toEqual(progress);
    expect(await runtime.db.quizAttempts.get(attempt.id)).toEqual(attempt);
  });

  it('records a failing quiz attempt without granting a pass', async () => {
    fresh();
    const runtime = await harness.boot('student-active');
    const services = createCourseServices(runtime);
    const course = (await runtime.db.courses.get('course_research'))!;
    const quiz = (await runtime.db.quizzes.where('courseId').equals(course.id).first())!;
    const answers = Object.fromEntries(
      quiz.questions.map((question) => [
        question.id,
        (question.correctIndex + 1) % question.choices.length,
      ])
    );

    const attempt = await services.quizzes.submit({ quizId: quiz.id, answers });
    expect(attempt.score).toBe(0);
    expect(attempt.passed).toBe(false);
    expect(await runtime.db.quizAttempts.get(attempt.id)).toEqual(attempt);
  });

  it('denies lesson and quiz mutations to an instructor persona', async () => {
    fresh();
    const runtime = await harness.boot('instructor-cohort');
    const services = createCourseServices(runtime);
    const lesson = (await runtime.db.lessons.toArray())[0]!;
    const quiz = (await runtime.db.quizzes.toArray())[0]!;
    const answers = Object.fromEntries(
      quiz.questions.map((question) => [question.id, question.correctIndex])
    );

    await expect(services.lessons.complete(lesson.id)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(services.quizzes.submit({ quizId: quiz.id, answers })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(await runtime.db.lessonProgress.count()).toBeGreaterThan(0);
    expect(await runtime.db.quizAttempts.count()).toBe(0);
  });

  it('surfaces simulated offline failures without writing progress or attempts', async () => {
    fresh();
    const runtime = await harness.boot('network-offline');
    const services = createCourseServices(runtime);
    const lesson = (await runtime.db.lessons.toArray())[0]!;
    const quiz = (await runtime.db.quizzes.toArray())[0]!;
    const answers = Object.fromEntries(
      quiz.questions.map((question) => [question.id, question.correctIndex])
    );

    await expect(services.lessons.complete(lesson.id)).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    await expect(services.quizzes.submit({ quizId: quiz.id, answers })).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    expect(await runtime.db.lessonProgress.count()).toBe(0);
    expect(await runtime.db.quizAttempts.count()).toBe(0);
  });

  it('validates that every quiz question has a submitted choice', async () => {
    fresh();
    const runtime = await harness.boot('student-active');
    const services = createCourseServices(runtime);
    const quiz = (await runtime.db.quizzes.toArray())[0]!;

    await expect(services.quizzes.submit({ quizId: quiz.id, answers: {} })).rejects.toMatchObject({
      issues: { answers: expect.any(String) },
    });
  });
});
