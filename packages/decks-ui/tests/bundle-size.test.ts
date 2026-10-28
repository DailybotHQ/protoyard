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
 * Caps at the measured size + 5 % (2026-10-28, PLAN_008 T-protoyard-migration),
 * after DeckApp moved onto the `@texuli/slides` stage:
 *
 * - Initial JS: 129,079 B gzip (was 96,068 B with Protoyard's own stage). The
 *   stage (DeckStage, toolbar, chrome, overview, the deck model's validation
 *   and migration, and the block schemas it checks free slides with) is on
 *   the first screen; Protoyard's own share is DeckApp (about 3 KB). Cap
 *   135,500 B.
 * - First-screen CSS: 6,921 B gzip (the stage stylesheet and DeckApp). Cap
 *   7,300 B.
 * - All emitted CSS: 72,999 B gzip. Most of it is lazy stylesheets of the
 *   stage's default component registry (charts, data views, chat, workflows,
 *   forms painters), which a Protoyard deck never loads (it has no component
 *   slides) but the stage always installs. Cap 76,650 B. Was 23,663 B
 *   measured on 2026-10-24 (24,846 B cap).
 */
const INITIAL_JS_GZIP_CAP = 135_500;
const INITIAL_CSS_GZIP_CAP = 7_300;
const ALL_CSS_GZIP_CAP = 76_650;

function initialCssGzip(build: DeckBuild): number {
  const imported = new Set(
    initialChunks(build).flatMap((chunk) => [
      ...((chunk as unknown as { viteMetadata?: { importedCss: Set<string> } }).viteMetadata
        ?.importedCss ?? []),
    ])
  );
  return cssGzip(build.assets.filter((asset) => imported.has(asset.fileName)));
}

describe('decks-ui ./app initial bundle (production Vite build)', () => {
  it('stays within its JavaScript and CSS caps', () => {
    const initial = initialChunks(output);
    const jsBytes = sumGzip(initial);
    const firstCss = initialCssGzip(output);
    const allCssBytes = cssGzip(output.assets);
    console.info(
      `deck app initial bundle: ${Math.ceil(jsBytes * KB_PER_BYTE)} KB JS gzip (${jsBytes} B), ${firstCss} B first-screen CSS gzip, ${Math.ceil(allCssBytes * KB_PER_BYTE)} KB all emitted CSS gzip (${allCssBytes} B)`
    );
    expect(initial.length).toBeGreaterThan(0);
    expect(jsBytes, `initial JS ${jsBytes} B gzip`).toBeLessThanOrEqual(INITIAL_JS_GZIP_CAP);
    expect(firstCss, `first-screen CSS ${firstCss} B gzip`).toBeLessThanOrEqual(
      INITIAL_CSS_GZIP_CAP
    );
    expect(allCssBytes, `all emitted CSS ${allCssBytes} B gzip`).toBeLessThanOrEqual(
      ALL_CSS_GZIP_CAP
    );
  });

  it('keeps layout renderers, slide renderers and optional surfaces out of the app graph', () => {
    const initial = initialChunks(output);
    const moduleIds = initial.flatMap((chunk) => chunk.moduleIds.map(posix));
    const lazy = (pattern: RegExp) =>
      output.chunks.some(
        (chunk) => chunk.isDynamicEntry && chunk.moduleIds.some((id) => pattern.test(posix(id)))
      );
    // The stage's 20 layout renderers load per layout (the Texuli layouts table).
    for (const renderer of ['TitleHero', 'BigStat', 'ChartSlide', 'MediaSide', 'Timeline']) {
      const pattern = new RegExp(`/slides/src/layouts/${renderer}\\.svelte$`);
      expect(
        moduleIds.some((id) => pattern.test(id)),
        renderer
      ).toBe(false);
      expect(lazy(pattern), `${renderer} is a lazy chunk`).toBe(true);
    }
    // Protoyard's free and custom slide renderers, Deck Studio, the debug panel and print.
    for (const surface of [
      /\/decks-ui\/src\/app\/FreeSlide\.svelte$/,
      /\/decks-ui\/src\/app\/CustomSlide\.svelte$/,
      /\/decks-ui\/src\/studio\//,
      /\/decks-ui\/src\/debug\/DeckDebugPanel\.svelte$/,
      /\/slides\/src\/export\/(?:pptx|DeckPrintPages)/,
    ]) {
      expect(
        moduleIds.some((id) => surface.test(id)),
        String(surface)
      ).toBe(false);
    }
    expect(lazy(/\/decks-ui\/src\/app\/FreeSlide\.svelte$/), 'free slides are a lazy chunk').toBe(
      true
    );
    expect(
      lazy(/\/packages\/charts(?:-ui)?\/src\//),
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
