import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildDeckEntry,
  cleanupDeckBuild,
  cssGzip,
  type DeckBuild,
  initialChunks,
  KB_PER_BYTE,
  posix,
  sumGzip,
} from './bundle-support.ts';

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

describe('decks-ui ./app initial bundle (production Vite build)', () => {
  it('stays within 120 KB gzip JavaScript and 20 KB gzip CSS', () => {
    const initial = initialChunks(output);
    const jsBytes = sumGzip(initial);
    const allCssBytes = cssGzip(output.assets);
    console.info(
      `deck app initial bundle: ${Math.ceil(jsBytes * KB_PER_BYTE)} KB JS gzip (${jsBytes} B), ${Math.ceil(allCssBytes * KB_PER_BYTE)} KB all emitted CSS gzip (${allCssBytes} B)`
    );
    expect(initial.length).toBeGreaterThan(0);
    expect(jsBytes, `initial JS ${jsBytes} B gzip`).toBeLessThanOrEqual(120 * 1024);
    expect(allCssBytes, `all emitted CSS ${allCssBytes} B gzip`).toBeLessThanOrEqual(20 * 1024);
  });

  it('keeps layout families and optional presenter, print and studio surfaces out of the app graph', () => {
    const initial = initialChunks(output);
    const moduleIds = initial.flatMap((chunk) => chunk.moduleIds.map(posix));
    const layoutFamilies = ['text', 'media', 'data', 'diagram'];
    for (const family of layoutFamilies) {
      expect(
        moduleIds.some((id) => id.includes(`/decks-ui/src/layouts/${family}/`)),
        family
      ).toBe(false);
      expect(
        output.chunks.some(
          (chunk) =>
            chunk.isDynamicEntry &&
            chunk.moduleIds.some((id) => posix(id).includes(`/decks-ui/src/layouts/${family}/`))
        ),
        `${family} layout is present as a lazy chunk`
      ).toBe(true);
    }
    for (const surface of ['presenter', 'studio']) {
      expect(
        moduleIds.some((id) => id.includes(`/decks-ui/src/${surface}/`)),
        surface
      ).toBe(false);
    }
    expect(
      output.chunks.some(
        (chunk) =>
          chunk.isDynamicEntry &&
          chunk.moduleIds.some((id) => posix(id).includes('/packages/charts-ui/src/'))
      ),
      'chart families are present as lazy chunks'
    ).toBe(true);
  });

  it('does not statically reach the app stack, player worker, or syntax highlighter', () => {
    const modules = initialChunks(output).flatMap((chunk) => chunk.moduleIds.map(posix));
    const forbidden =
      /\/packages\/(?:crud|charts-ui|player)\/|@faker-js\/faker|highlight\.js|highlighter|generate\.worker/;
    expect(modules.filter((id) => forbidden.test(id))).toEqual([]);
  });
});
