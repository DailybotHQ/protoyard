// @vitest-environment node
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BRIEFS, importGraph, median, parseArgs, stats } from '../../scripts/bench-brief-kinds.ts';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

describe('bench-brief-kinds', () => {
  it('covers app, deck, page and doc with two fictional briefs each', () => {
    for (const kind of ['app', 'deck', 'page', 'doc'] as const) {
      expect(BRIEFS.filter((brief) => brief.expected === kind)).toHaveLength(2);
    }
    expect(new Set(BRIEFS.map((brief) => brief.id)).size).toBe(BRIEFS.length);
  });

  it('parses runs, iterations and an output confined to tmp/', () => {
    expect(parseArgs([])).toEqual({ runs: 3, iterations: 50, out: null });
    expect(parseArgs(['--runs', '5', '--iterations', '10', '--out', 'tmp/x.json'])).toEqual({
      runs: 5,
      iterations: 10,
      out: join(ROOT, 'tmp', 'x.json'),
    });
    expect(() => parseArgs(['--runs', '0'])).toThrow(/whole number/);
    expect(() => parseArgs(['--iterations', '1.5'])).toThrow(/whole number/);
    expect(() => parseArgs(['--out', 'docs/x.json'])).toThrow(/inside tmp/);
    expect(() => parseArgs(['--out', '../escape.json'])).toThrow(/inside tmp/);
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown option/);
  });

  it('computes medians and rounded stats', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(() => median([])).toThrow(/non-empty/);
    expect(stats([0.1234, 0.5, 0.2])).toEqual({ median: 0.2, min: 0.123, max: 0.5 });
  });

  it('uses the deck layout catalog only as a read-only authoring dependency', () => {
    const graph = importGraph(join(ROOT, 'packages/blueprint/src/brief/index.ts'));
    expect(graph.local).toContain('packages/blueprint/src/brief/synthesize.ts');
    // Deck synthesis selects catalog layouts deterministically; the import is intentional.
    expect(graph.external.some((spec) => spec === '@protoyard/decks/layouts')).toBe(true);
    // Runtime player chunks are checked by the bench itself (no player build in unit tests).
  });
});
