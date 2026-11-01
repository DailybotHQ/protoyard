import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildDeckEntry,
  cleanupDeckBuild,
  cssGzip,
  type DeckBuild,
  gzip,
  initialChunks,
  KB_PER_BYTE,
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
 * Re-measured 2026-10-28 on npm Texuli 0.5.0: initial JS
 * 106,340 B gzip (from 134,092 B: with DeckApp's own free renderer and block
 * check and `defaultRenderers={false}`, the stage no longer reaches its default
 * tables or the built-in block chunk on the first screen), first-screen CSS
 * 8,479 B, all emitted CSS 79,410 B. Caps at +5 %: 111,657 B, 8,903 B and
 * 83,381 B. `migrateDeck` stays on the entry by choice: DeckApp converts the
 * Protoyard deck once (`checkProtoyardDeck`) and hands the stage a v2 deck, so
 * the stage paints on the first render instead of showing its loading status
 * while its lazy migration chunk loads (the stage then validates that deck
 * again: Texuli takes no prepared deck).
 *
 * Re-measured 2026-10-30 (PLAN_008 T-decks-latest, npm @texuli/slides 0.8.2):
 * DeckApp on `DeckStageCore` (G72) with a prepared deck (`prepareDeckV2`, G83),
 * the debug button as a stage host tool (G82) and the print view preloaded on
 * idle (G81). Initial JS 107,246 B gzip (109,406 B before the task), first-screen
 * CSS 8,914 B (8,952 B), all emitted CSS 82,210 B (82,248 B). The caps stay.
 * All emitted CSS barely moves: the stage core no longer reaches the default
 * tables, but `@texuli/slides/export` (the print view and its preload) still
 * imports `stage/defaults.js` dynamically even with `defaultRenderers: false`,
 * so the build still emits their lazy chunks: about 27 KB of CSS and 275 KB of
 * JS gzip a Protoyard deck never loads (reported as a Texuli gap).
 *
 * Note for the all-CSS cap: most of it (all CSS was 23,663 B before the stage)
 * is lazy stylesheets of the stage's default component registry
 * (`@texuli/player` painters, data views, workflow editor) that DeckApp never
 * loads (`defaultRenderers={false}`), but
 * the bundler still emits them because the stage keeps its dynamic import of
 * the defaults (reported as a Texuli gap); lower when the stage can be built
 * without it.
 */
// Texuli 0.10.0 (PLAN_008, 2026-10-31): the print view comes from
// `@texuli/slides/export-core` (G105), so the build no longer emits the stage's
// default tables, and @protoyard/themes loads `@texuli/tokens/system.css` instead
// of base.css (G110). Measured initial JS 105,816 B (109,538 B on 0.10.0 before),
// first-screen CSS 9,404 B (10,152 B), all emitted CSS 57,011 B (86,765 B). The
// caps are not lowered here; the lead decides.
const INITIAL_JS_GZIP_CAP = 111_657;
// Texuli 0.8.0 (motion tokens) measured 8,952 B; + 1 % (PLAN_008: motion tokens and focus/forced-colors rules, kept by Texuli).
// Texuli 0.9.0 measured 10,153–10,225 B: token contract v2 component CSS plus
// @texuli/tokens/base.css, which declares the system tokens it reads (Texuli
// gap G110 asks for a tokens-only sheet); + 2.5 % of the higher run.
const INITIAL_CSS_GZIP_CAP = 10_481;
// Texuli 0.9.0 measured 85,945 B (contract v2 component CSS, gap G110); + 2.5 %.
const ALL_CSS_GZIP_CAP = 88_094;

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
});

// Moved from debug-panel.test.ts so the Debug for agents cap reuses this file's one build.
describe('the Debug for agents lazy chunk', () => {
  // The panel chunk carries Texuli's deck lint (@texuli/deck/authoring) and Badge.
  // Texuli 0.12.0 measured 12,249 B gzip locally and 12,321 B in CI (Linux); the
  // cap is the CI measurement + 2.5 % (was 12 KB).
  it('stays out of the deck entry and under its gzip cap', () => {
    const initial = initialChunks(output);
    const isPanel = (id: string) => id.includes('/decks-ui/src/debug/DeckDebugPanel.svelte');
    expect(initial.some((chunk) => Object.keys(chunk.modules).some(isPanel))).toBe(false);
    const lazy = output.chunks.find((chunk) => Object.keys(chunk.modules).some(isPanel));
    expect(lazy).toBeDefined();
    expect(gzip(lazy?.code ?? '')).toBeLessThanOrEqual(12_630);
  });
});
