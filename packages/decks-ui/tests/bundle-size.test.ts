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

/**
 * All emitted CSS, every lazy block and layout family included. The default is
 * 20 KB and stays; this is an override for this entry only, at the measured
 * size + 5 %: 23,663 B gzip on 2026-10-24 (24,846 B cap). Texuli component CSS
 * (~23 KB gz) replaces the former UI CSS; eager/lazy split measured; CSS diet
 * tracked as a follow-up. The first screen still loads one 1,025 B stylesheet
 * with no Texuli family CSS; the rest sits in ~28 lazy family stylesheets, and
 * no rule repeats across them beyond one 136 B `.tx-sr-only`.
 */
const ALL_CSS_GZIP_CAP = 24_846;

describe('decks-ui ./app initial bundle (production Vite build)', () => {
  it('stays within 120 KB gzip JavaScript and 24.3 KB gzip CSS', () => {
    const initial = initialChunks(output);
    const jsBytes = sumGzip(initial);
    const allCssBytes = cssGzip(output.assets);
    console.info(
      `deck app initial bundle: ${Math.ceil(jsBytes * KB_PER_BYTE)} KB JS gzip (${jsBytes} B), ${Math.ceil(allCssBytes * KB_PER_BYTE)} KB all emitted CSS gzip (${allCssBytes} B)`
    );
    expect(initial.length).toBeGreaterThan(0);
    expect(jsBytes, `initial JS ${jsBytes} B gzip`).toBeLessThanOrEqual(120 * 1024);
    expect(allCssBytes, `all emitted CSS ${allCssBytes} B gzip`).toBeLessThanOrEqual(
      ALL_CSS_GZIP_CAP
    );
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
