// @vitest-environment node
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type DsViolation,
  scanPrototypeDesignSystem,
} from '../../packages/cli/src/lib/ds-check/index.ts';

/**
 * PLAN_013: a prototype created from a template and locked to a design system
 * renders only through the design system's components. The AI and chat
 * templates draw typography with Heading and Text and surfaces with Box, Card
 * and Notice (Texuli 0.15.0), so a locked scan finds no violation.
 */
const root = resolve(import.meta.dirname, '../..');

const describeViolation = (v: DsViolation) => `${v.file}:${v.line} ${v.rule} ${v.message}`;

describe('group ai', () => {
  for (const template of ['ai-assistant', 'agent-console', 'chat', 'team-chat']) {
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
