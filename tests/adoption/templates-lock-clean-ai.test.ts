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
 *
 * One exception, a checker gap and not a template choice: Protoyard's own
 * frame-height utilities (`h-app`, `min-h-app`, `max-h-app`, from
 * @protoyard/themes) and Tailwind's `@container` marker are layout, like the
 * `*-safe` and `*-touch` tokens the allow-list already accepts, but the
 * allow-list does not list them yet. Remove this list once
 * packages/cli/src/lib/ds-check/utilities.ts accepts them.
 */
const root = resolve(import.meta.dirname, '../..');

const CHECKER_GAP_TOKENS = new Set(['h-app', 'min-h-app', 'max-h-app', '@container']);

function isCheckerGap(v: DsViolation): boolean {
  const token = v.message.match(/^class "([^"]+)" is not an allowed layout utility$/)?.[1];
  return v.rule === 'ds-utility' && token !== undefined && CHECKER_GAP_TOKENS.has(token);
}

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
      expect(violations.filter((v) => !isCheckerGap(v)).map(describeViolation)).toEqual([]);
    });
  }
});
