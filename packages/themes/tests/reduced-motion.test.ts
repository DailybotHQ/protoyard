import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../src/base.css'), 'utf8');

/** From `prelude` to the end of the first declaration block after it. */
function block(prelude: string): string {
  const start = css.indexOf(prelude);
  expect(start, `${prelude} rule`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

// A non-zero transition duration on every element makes `visibility` (part of
// the default `transition-property: all`) transition too, so content that turns
// visible appears one nesting level per frame. The deck E2E proves the effect
// (tests/e2e/deck-navigation.spec.ts); this pins the rules.
describe('reduced motion reset', () => {
  for (const selector of [
    '@media (prefers-reduced-motion: reduce)',
    '[data-py-motion="reduce"] *',
  ]) {
    it(`${selector} starts no transition at all`, () => {
      const rules = block(selector);
      expect(rules).toMatch(/transition-duration:\s*0s\s*!important/);
      expect(rules).toMatch(/transition-delay:\s*0s\s*!important/);
      expect(rules).not.toMatch(/transition-duration:\s*0\.01ms/);
    });
  }
});
