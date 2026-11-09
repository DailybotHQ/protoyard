// @vitest-environment node
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type DsViolation,
  scanPrototypeDesignSystem,
} from '../../packages/cli/src/lib/ds-check/index.ts';

/**
 * PLAN_013: a prototype created from a template and locked to a design system
 * renders only through the design system's components. The mobile and content
 * templates draw type with Heading, Text and Prose, and surfaces with Box, so
 * they have no locked design system violation at all, typography included.
 */
const root = resolve(import.meta.dirname, '../..');

const describeViolation = (v: DsViolation) => `${v.file}:${v.line} ${v.rule} ${v.message}`;

function expectLockClean(template: string): void {
  const { files, violations } = scanPrototypeDesignSystem(
    root,
    resolve(root, 'templates', template),
    { designSystemId: 'fixture' }
  );
  expect(files.length).toBeGreaterThan(0);
  expect(violations.map(describeViolation)).toEqual([]);
}

describe('group mobile', () => {
  for (const template of ['mobile-app', 'onboarding']) {
    it(`${template} has no locked design system violation`, () => {
      expectLockClean(template);
    });
  }
});

describe('group content', () => {
  for (const template of ['deck', 'page', 'doc', 'docs-wiki']) {
    it(`${template} has no locked design system violation`, () => {
      expectLockClean(template);
    });
  }
});
