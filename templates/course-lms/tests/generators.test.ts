import { describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { CourseLmsDatabase } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import { scenarios } from '../src/scenarios/index.ts';

describe('course LMS scenario generator', () => {
  it('repeats course content, enrollments and cohort schedules for every scenario', async () => {
    for (const scenario of scenarios) {
      const harness = createHarness<CourseLmsDatabase>(definition);
      try {
        const first = await harness.boot(scenario.id);
        const snapshot = {
          courses: await first.db.courses.orderBy('id').toArray(),
          lessons: await first.db.lessons.orderBy('id').toArray(),
          enrollments: await first.db.enrollments.orderBy('id').toArray(),
          sessions: await first.db.cohortSessions.orderBy('id').toArray(),
        };
        const second = await harness.boot(scenario.id);
        expect({
          courses: await second.db.courses.orderBy('id').toArray(),
          lessons: await second.db.lessons.orderBy('id').toArray(),
          enrollments: await second.db.enrollments.orderBy('id').toArray(),
          sessions: await second.db.cohortSessions.orderBy('id').toArray(),
        }).toEqual(snapshot);
        expect(snapshot.courses).toHaveLength(Number(scenario.generators?.courses ?? 3));
        if (snapshot.courses.length) {
          expect(snapshot.lessons.length).toBeGreaterThan(0);
          expect(snapshot.enrollments.length).toBeGreaterThan(0);
          expect(snapshot.sessions.length).toBeGreaterThan(0);
        }
      } finally {
        harness.closeAll();
      }
    }
  });
});
