// @vitest-environment node
/**
 * Keeps docs/PERFORMANCE.md "Brief synthesis by kind" honest: every kind row
 * must claim full detection and validation (the post-wiring contract), and must
 * not revive the 2026-10-21 "schema not wired / drafts lack id" narrative.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DOC = join(ROOT, 'docs/PERFORMANCE.md');

describe('PERFORMANCE brief synthesis by kind section', () => {
  it('reports all four kinds as detecting and validating 2 of 2', () => {
    const text = readFileSync(DOC, 'utf8');
    const start = text.indexOf('## Brief synthesis by kind');
    expect(start).toBeGreaterThan(-1);
    const end = text.indexOf('\n## ', start + 1);
    const section = text.slice(start, end === -1 ? undefined : end);

    expect(section).not.toMatch(/not wired yet|drafts lack|lack `?(page|doc)\.id`/i);
    expect(section).toMatch(/measured 2026-10-2[2-9]|measured 2026-1[1-2]/);

    for (const kind of ['app', 'deck', 'page', 'doc']) {
      const row = section
        .split('\n')
        .find((line) => line.startsWith(`| ${kind} |`) || line.startsWith(`| ${kind}|`));
      expect(row, `table row for ${kind}`).toBeTruthy();
      expect(row).toMatch(/2 of 2/);
      expect(row).toMatch(/2 of 2\s*\|\s*$|2 of 2\s*\|/);
      // Validates column is the last numeric pair — both cells 2 of 2
      const pairs = [...(row?.matchAll(/(\d+) of (\d+)/g) ?? [])].map((m) => m[0]);
      expect(pairs.length).toBeGreaterThanOrEqual(2);
      expect(pairs.at(-1)).toBe('2 of 2');
      expect(pairs.at(-2)).toBe('2 of 2');
    }
  });
});
