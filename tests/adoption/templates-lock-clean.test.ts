// @vitest-environment node
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type DsViolation,
  scanPrototypeDesignSystem,
} from '../../packages/cli/src/lib/ds-check/index.ts';

/**
 * PLAN_013: a prototype created from a template and locked to a design system
 * renders only through the design system's components. Texuli's typography
 * components (Heading, Text, Prose, Box) cover titles, body copy, figures and
 * surfaces, so a template that is lock-clean has zero violations of any rule.
 * `split` still reports typography apart so a regression names its kind.
 */
const root = resolve(import.meta.dirname, '../..');

const TYPOGRAPHY =
  /^(?:[\w@-]+:)*(?:text-(?!left$|center$|right$|justify$|start$|end$|wrap$|nowrap$|balance$|pretty$)[\w-]+|font-[\w-]+|leading-[\w-]+|tracking-[\w-]+|tabular-nums|uppercase|lowercase|capitalize|normal-case|italic|not-italic)$/;

function isTypography(v: DsViolation): boolean {
  const token = v.message.match(/^class "([^"]+)"/)?.[1] ?? '';
  return v.rule === 'ds-utility' && TYPOGRAPHY.test(token);
}

/** Splits a scan into typography-only violations and everything else. */
function split(template: string) {
  const { files, violations } = scanPrototypeDesignSystem(
    root,
    resolve(root, 'templates', template),
    {
      designSystemId: 'fixture',
    }
  );
  const typography = violations.filter(isTypography);
  // A file flagged as a styled local component only because of typography utilities.
  const otherFiles = new Set(
    violations
      .filter((v) => v.rule !== 'ds-styled-local-component' && !isTypography(v))
      .map((v) => v.file)
  );
  const styledByTypography = violations.filter(
    (v) => v.rule === 'ds-styled-local-component' && !otherFiles.has(v.file)
  );
  const other = violations.filter((v) => !isTypography(v) && !styledByTypography.includes(v));
  return { files, typography: typography.length + styledByTypography.length, other };
}

const describeViolation = (v: DsViolation) => `${v.file}:${v.line} ${v.rule} ${v.message}`;

function expectLockClean(template: string) {
  const scan = split(template);
  expect(scan.files.length).toBeGreaterThan(0);
  expect(scan.other.map(describeViolation)).toEqual([]);
  expect(scan.typography).toBe(0);
}

describe('group saas', () => {
  for (const template of ['dashboard', 'b2b-saas', 'admin-console', 'crud-app']) {
    it(`${template} has no locked design system violation`, () => {
      expectLockClean(template);
    });
  }
});

describe('blank', () => {
  it('blank has no locked design system violation', () => {
    expectLockClean('blank');
  });
});
