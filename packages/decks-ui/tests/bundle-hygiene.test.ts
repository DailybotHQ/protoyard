import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildDeckEntry,
  cleanupDeckBuild,
  type DeckBuild,
  initialChunks,
  posix,
} from './bundle-support.ts';

const SRC = join(import.meta.dirname, '../src');
let dir = '';
let output: DeckBuild;

beforeAll(async () => {
  const result = await buildDeckEntry();
  dir = result.dir;
  output = result.output;
}, 600_000);

afterAll(async () => {
  if (dir) await cleanupDeckBuild(dir);
});

describe('decks-ui entry hygiene', () => {
  const pkg = JSON.parse(readFileSync(join(SRC, '../package.json'), 'utf8')) as {
    exports: Record<string, unknown>;
  };

  it('keeps optional presentation surfaces on separate package subpaths', () => {
    expect(pkg.exports['./app']).toBeDefined();
    for (const subpath of ['./presenter', './print', './studio']) {
      expect(pkg.exports[subpath], subpath).toBeDefined();
      const entry = pkg.exports[subpath] as Record<string, string>;
      expect(entry.default, subpath).toMatch(new RegExp(`/src/${subpath.slice(2)}/index\\.ts$`));
    }
    const app = readFileSync(join(SRC, 'app/index.ts'), 'utf8');
    expect(app).not.toMatch(/from\s*['"]\.\.\/(?:presenter|print|studio)\//);
    expect(app).not.toMatch(/from\s*['"]@protoyard\/decks-ui\/(?:presenter|print|studio)['"]/);
    const deckApp = readFileSync(join(SRC, 'app/DeckApp.svelte'), 'utf8');
    expect(deckApp).toContain("{#if inputState.overview === 'open'}");
  });

  it('keeps heavy app packages out of the static deck app graph', () => {
    const modules = initialChunks(output).flatMap((chunk) => chunk.moduleIds.map(posix));
    const forbidden =
      /\/packages\/(?:crud|charts-ui|player)\/|@faker-js\/faker|highlight\.js|highlighter|generate\.worker/;
    expect(modules.filter((id) => forbidden.test(id))).toEqual([]);
  });
});
