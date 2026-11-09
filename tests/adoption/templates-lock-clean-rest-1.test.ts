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
 * typography with Heading and Text, surfaces with Box, Card and Table, and
 * keep only layout utilities and layout-only CSS (Texuli 0.15.0), so a locked
 * scan finds no violation and needs no exception list.
 */
const root = resolve(import.meta.dirname, '../..');

const describeViolation = (v: DsViolation) => `${v.file}:${v.line} ${v.rule} ${v.message}`;

describe('group rest part 1', () => {
  for (const template of [
    'analytics',
    'booking-calendar',
    'chat-widget',
    'clinic',
    'course-lms',
    'design-kit',
  ]) {
    it(`${template} has no locked design system violation`, () => {
      const { files, violations } = scanPrototypeDesignSystem(
        root,
        resolve(root, 'templates', template),
        { designSystemId: 'fixture' }
      );
      expect(files.length).toBeGreaterThan(0);
      expect(violations.map(describeViolation)).toEqual([]);
    });
  }
});
