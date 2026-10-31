import { readdirSync, readFileSync } from 'node:fs';
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

  it('keeps optional host surfaces on separate package subpaths', () => {
    expect(pkg.exports['./app']).toBeDefined();
    // The presenter, print and overview are the @texuli/slides stage's; Protoyard keeps none.
    expect(pkg.exports['./presenter']).toBeUndefined();
    expect(pkg.exports['./print']).toBeUndefined();
    for (const subpath of ['./studio', './debug']) {
      expect(pkg.exports[subpath], subpath).toBeDefined();
      const entry = pkg.exports[subpath] as Record<string, string>;
      expect(entry.default, subpath).toMatch(new RegExp(`/src/${subpath.slice(2)}/index\\.ts$`));
    }
    const app = readFileSync(join(SRC, 'app/index.ts'), 'utf8');
    expect(app).not.toMatch(/from\s*['"]\.\.\/(?:studio|debug)\//);
    expect(app).not.toMatch(/from\s*['"]@protoyard\/decks-ui\/(?:studio|debug)['"]/);
    const deckApp = readFileSync(join(SRC, 'app/DeckApp.svelte'), 'utf8');
    // The stage core: no reference to the stage's default renderer tables (Texuli G72).
    expect(deckApp).toContain("from '@texuli/slides/stage-core'");
    // The debug panel and the print page load on first use.
    expect(deckApp).toContain("import('../debug/DeckDebugPanel.svelte')");
    expect(deckApp).toContain("import('@texuli/slides/export')");
  });

  it('imports the @texuli/slides stage only through its core', () => {
    const sources = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((file) =>
      /\.(?:ts|svelte)$/.test(file)
    );
    expect(sources.length).toBeGreaterThan(10);
    const full = sources.filter((file) =>
      /from\s*['"]@texuli\/slides\/stage['"]/.test(readFileSync(join(SRC, file), 'utf8'))
    );
    expect(full).toEqual([]);
  });

  it('keeps heavy app packages out of the static deck app graph', () => {
    const modules = initialChunks(output).flatMap((chunk) => chunk.moduleIds.map(posix));
    const forbidden =
      /\/packages\/(?:crud|charts-ui|player)\/|@faker-js\/faker|highlight\.js|highlighter|generate\.worker/;
    expect(modules.filter((id) => forbidden.test(id))).toEqual([]);
  });
});
