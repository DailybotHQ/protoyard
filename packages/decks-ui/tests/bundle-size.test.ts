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
 * - First-screen CSS: 6,921 B gzip (the stage stylesheet and DeckApp); 8,475 B
 *   re-measured 2026-10-28 on npm Texuli 0.4.0 (Texuli component CSS on the
 *   deck entry, with the debug tool's IconButton). Cap 8,899 B.
 * - All emitted CSS: 72,999 B gzip. Most of it is lazy stylesheets of the
 *   stage's default component registry (charts, data views, chat, workflows,
 *   forms painters), which a Protoyard deck never loads (it has no component
 *   slides) but the stage always installs. Cap 76,650 B. Was 23,663 B
 *   measured on 2026-10-24 (24,846 B cap). On npm 0.4.0: initial JS 134,092
 *   B and all CSS 76,345 B, inside their caps.
 *
 * Re-measured 2026-10-28 on npm Texuli 0.5.0 (PLAN_007 T-adopt050): initial JS
 * 106,344 B gzip (from 134,092 B: with DeckApp's own free renderer and block
 * check and `defaultRenderers={false}`, the stage no longer reaches its default
 * tables, the built-in block chunk or `migrateDeck` on the first screen; G24,
 * G46), first-screen CSS 8,479 B, all emitted CSS 79,410 B. Caps at +5 %:
 * 111,662 B, 8,903 B and 83,381 B.
 *
 * Note for the all-CSS cap: most of it (all CSS was 23,663 B before the stage)
 * is lazy stylesheets of the stage's default component registry
 * (`@texuli/player` painters, data views, workflow editor) that DeckApp never
 * loads (`defaultRenderers={false}`), but
 * the bundler still emits them because the stage keeps its dynamic import of
 * the defaults (reported as a Texuli gap); lower when the stage can be built
 * without it.
 */
const INITIAL_JS_GZIP_CAP = 111_662;
const INITIAL_CSS_GZIP_CAP = 8_903;
const ALL_CSS_GZIP_CAP = 83_381;

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
      const pattern = new RegExp(`/slides/(?:src|dist)/layouts/${renderer}\\.svelte$`);
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
      /\/slides\/(?:src|dist)\/export\/(?:pptx|DeckPrintPages)/,
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
