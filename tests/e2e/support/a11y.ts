import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

/** WCAG 2.0/2.1 A + AA: the bar the product spec sets for every screen. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['serious', 'critical']);

/**
 * Runs axe on the current page and fails on serious or critical violations.
 * Minor/moderate findings are attached to the report (not hidden, not fatal),
 * so they stay visible without making the suite flaky on cosmetic rules.
 */
export async function expectAccessible(
  page: Page,
  testInfo: TestInfo,
  options: { include?: string; exclude?: string[]; label?: string } = {}
) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (options.include) builder = builder.include(options.include);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
  await testInfo.attach(`axe-${options.label ?? 'page'}.json`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  const summary = blocking.map(
    (v) =>
      `${v.impact} ${v.id}: ${v.help} — ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`
  );
  expect(summary, `axe serious/critical violations on ${options.label ?? page.url()}`).toEqual([]);
}
