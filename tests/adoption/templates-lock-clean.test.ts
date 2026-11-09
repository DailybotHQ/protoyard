// @vitest-environment node
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type DsViolation,
  scanPrototypeDesignSystem,
} from '../../packages/cli/src/lib/ds-check/index.ts';

/**
 * PLAN_013: a prototype created from a template and locked to a design system
 * renders only through the design system's components. Texuli has no heading
 * or text component yet, so typography utilities (size, weight, color of
 * text, leading, tracking, numeric and case styling) are the one accepted
 * leftover: everything else must be clean, and the typography count may only
 * go down until the components ship.
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

describe('group saas', () => {
  // Typography-only violations left per template (ceilings: lower them as they go).
  const TYPOGRAPHY_CEILING: Record<string, number> = {
    dashboard: 35,
    'b2b-saas': 27,
    'admin-console': 35,
    'crud-app': 0,
  };

  for (const [template, ceiling] of Object.entries(TYPOGRAPHY_CEILING)) {
    it(`${template} has no locked design system violation besides typography`, () => {
      const scan = split(template);
      expect(scan.files.length).toBeGreaterThan(0);
      expect(scan.other.map(describeViolation)).toEqual([]);
      expect(scan.typography).toBeLessThanOrEqual(ceiling);
    });
  }
});
