// @vitest-environment node
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type DsViolation,
  scanPrototypeDesignSystem,
} from '../../packages/cli/src/lib/ds-check/index.ts';

/**
 * PLAN_013: a prototype created from a template and locked to a design system
 * renders only through the design system's components. These templates draw
 * typography with Heading and Text, surfaces with Box, Card and Notice, and
 * states with Badge and Avatar tones (Texuli 0.15.0), so a locked scan finds
 * no violation.
 *
 * social-feed windows its feed with Texuli's VirtualListView (`mode="feed"`,
 * Texuli 0.16.1), re-exported from @protoyard/ui: the component sizes its own
 * spacers, so the template needs no inline style either.
 */
const root = resolve(import.meta.dirname, '../..');

const describeViolation = (v: DsViolation) => `${v.file}:${v.line} ${v.rule} ${v.message}`;

const scan = (template: string) =>
  scanPrototypeDesignSystem(root, resolve(root, 'templates', template), {
    designSystemId: 'fixture',
  });

describe('group rest part 3', () => {
  for (const template of [
    'marketplace',
    'plugin-panel',
    'project-management',
    'social-feed',
    'task-manager',
  ]) {
    it(`${template} has no locked design system violation`, () => {
      const { files, violations } = scan(template);
      expect(files.length).toBeGreaterThan(0);
      expect(violations.map(describeViolation)).toEqual([]);
    });
  }
});
