// @vitest-environment node
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type DsViolation,
  scanPrototypeDesignSystem,
} from '../../packages/cli/src/lib/ds-check/index.ts';

/**
 * PLAN_013: a prototype created from a template and locked to a design system
 * renders only through the design system's components. The desktop, commerce,
 * finance, monitoring and logistics templates draw typography with Heading and
 * Text, surfaces with Box, Card and Notice, and state with Button variants,
 * Chip, Badge and Progress (Texuli 0.15.0), so a locked scan finds no
 * violation. Maps, charts and sheets come from the Protoyard view and chart
 * kits; only their chrome is scanned here.
 */
const root = resolve(import.meta.dirname, '../..');

const describeViolation = (v: DsViolation) => `${v.file}:${v.line} ${v.rule} ${v.message}`;

describe('group rest part 2', () => {
  for (const template of [
    'desktop-app',
    'ecommerce',
    'fintech-dashboard',
    'iot-monitoring',
    'logistics-map',
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
