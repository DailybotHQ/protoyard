import { expect, test } from '@playwright/test';
import { waitForPrototypeReady } from './support/ready.ts';
import { PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

test.skip(
  !PROTOTYPE_TARGETS.includes('course-lms'),
  'set PROTOYARD_E2E_PROTOTYPES to include course-lms'
);

test('a learner completes a lesson, passes a quiz and retains progress', async ({ page }) => {
  await page.goto(`${prototypeUrl('course-lms')}?scenario=student-active`);
  await waitForPrototypeReady(page, { slug: 'course-lms' });

  const course = page.getByRole('article', { name: 'Research Foundations' });
  await expect(course).toBeVisible();
  await course.getByRole('button', { name: 'Mark complete' }).first().click();
  await expect(course.getByText('Completed', { exact: true }).first()).toBeVisible();

  await course.getByRole('radio', { name: 'Tell me about the last time this happened.' }).check();
  await course.getByRole('radio', { name: 'Suggesting the answer' }).check();
  await course.getByRole('button', { name: 'Submit Interview basics quiz' }).click();
  await expect(course.getByRole('status')).toContainText('Latest attempt: 100% · Passed');

  await page.reload();
  await waitForPrototypeReady(page, { slug: 'course-lms' });
  const reloadedCourse = page.getByRole('article', { name: 'Research Foundations' });
  await expect(reloadedCourse.getByText('Completed', { exact: true }).first()).toBeVisible();
  await expect(reloadedCourse.getByRole('status')).toContainText('Latest attempt: 100% · Passed');
});
