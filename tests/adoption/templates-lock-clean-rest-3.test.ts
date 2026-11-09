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
 * social-feed is pinned to its exact remaining violations, not filtered: its
 * windowed feed sizes the two spacers around the rendered rows with
 * `style:height` (layout, measured at run time), and neither Texuli nor
 * @protoyard/ui has a windowed list or a sized spacer to take that value. The
 * expectation turns red when the spacers change, so it goes to zero with the
 * component that replaces them.
 */
const root = resolve(import.meta.dirname, '../..');

const describeViolation = (v: DsViolation) => `${v.file}:${v.line} ${v.rule} ${v.message}`;

const scan = (template: string) =>
  scanPrototypeDesignSystem(root, resolve(root, 'templates', template), {
    designSystemId: 'fixture',
  });

describe('group rest part 3', () => {
  for (const template of ['marketplace', 'plugin-panel', 'project-management', 'task-manager']) {
    it(`${template} has no locked design system violation`, () => {
      const { files, violations } = scan(template);
      expect(files.length).toBeGreaterThan(0);
      expect(violations.map(describeViolation)).toEqual([]);
    });
  }

  it('social-feed has no locked design system violation beyond the windowed feed spacers', () => {
    const { files, violations } = scan('social-feed');
    expect(files.length).toBeGreaterThan(0);
    expect(violations.map((v) => `${v.file} ${v.rule} ${v.message}`)).toEqual([
      'templates/social-feed/src/components/VirtualFeed.svelte ds-inline-style inline style:height on <div>',
      'templates/social-feed/src/components/VirtualFeed.svelte ds-inline-style inline style:height on <div>',
    ]);
  });
});
