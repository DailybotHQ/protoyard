import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, type Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as entry from '../src/index.ts';
import {
  type AuthoringApis,
  blueprintFromBrief,
  buildDocOutline,
  buildPageOutline,
  detectBriefKind,
  lintDeckStructure,
  loadAuthoringApis,
  propsForSelectedLayout,
  selectDeckLayouts,
  synthesizeContentFromBrief,
  synthesizeDeckOutline,
  validateBlueprintForAuthoring,
} from '../src/index.ts';

/**
 * The authoring APIs ship from the package root (`@protoyard/blueprint`), with
 * no new subpath. These tests prove the contract the README documents:
 *
 * - every documented authoring name is a named export of the root entry;
 * - a consumer that only parses blueprints bundles none of them (tree-shaking,
 *   `sideEffects: false`), measured with a real Vite build of the linked
 *   package, the way a prototype resolves it;
 * - `loadAuthoringApis()` keeps them (and the deck layout catalog) out of the
 *   first chunk graph, in a lazy chunk.
 *
 * Run alone: `pnpm vitest run packages/blueprint/tests/authoring-exports.test.ts`
 */

const ROOT = resolve(import.meta.dirname, '../../..');

/** The authoring interface the README documents, by kind of export. */
const AUTHORING_FUNCTIONS = [
  'blueprintFromBrief',
  'synthesizeAppFromBrief',
  'synthesizeContentFromBrief',
  'synthesizeDeckFromBrief',
  'synthesizePageFromBrief',
  'synthesizeDocFromBrief',
  'isAppBriefResult',
  'isContentBriefResult',
  'detectBriefKind',
  'synthesizeDeckOutline',
  'chooseDeckOutline',
  'deckOutlineRange',
  'buildPageOutline',
  'buildDocOutline',
  'selectPageOutline',
  'selectDocOutline',
  'boundBriefInput',
  'prepareBriefForSynthesis',
  'checkOutlineBounds',
  'applyOutlineBounds',
  'lintDeckStructure',
  'selectDeckLayouts',
  'propsForSelectedLayout',
  'validateBlueprintForAuthoring',
  'detectBlueprintKind',
  'parseAnyBlueprint',
  'safeParseAnyBlueprint',
  'loadAuthoringApis',
] as const;
const AUTHORING_CONSTANTS = [
  'KIND_CUES',
  'APP_CUES',
  'DECK_OUTLINES',
  'DECK_OUTLINE_IDS',
  'PAGE_OUTLINE_IDS',
  'DOC_OUTLINE_IDS',
  'OUTLINE_LIMITS',
  'MAX_BRIEF_LENGTH',
  'MAX_CONTENT_BRIEF_LENGTH',
  'BLUEPRINT_KINDS',
  'CONTENT_KINDS',
] as const;

/** Source folders that hold authoring code (never needed to run a prototype). */
const AUTHORING_MODULES =
  /packages\/blueprint\/src\/(?:authoring\/|brief\/|authoring-validation\.ts)/;
const LAYOUT_CATALOG = /packages\/decks\/src\/layouts\//;

describe('the authoring interface on the public entry', () => {
  it.each(AUTHORING_FUNCTIONS)('exports %s as a function', (name) => {
    expect(typeof (entry as Record<string, unknown>)[name]).toBe('function');
  });

  it.each(AUTHORING_CONSTANTS)('exports %s as data', (name) => {
    const value = (entry as Record<string, unknown>)[name];
    expect(value === undefined || typeof value === 'function').toBe(false);
  });

  it('works end to end from the entry: detect, synthesize, lint', async () => {
    expect(detectBriefKind('Slides for our launch keynote').kind).toBe('deck');
    const deck = blueprintFromBrief('A 6-slide pitch deck for a bakery', { kind: 'deck' });
    expect(deck.kind).toBe('deck');
    // The draft's own quality is the synthesizer's concern; here the entry wiring is.
    const lint = lintDeckStructure(deck.json);
    expect(typeof lint.valid).toBe('boolean');
    expect(Array.isArray(lint.diagnostics)).toBe(true);
    const validation = await validateBlueprintForAuthoring(deck.json);
    expect(validation.kind).toBe('deck');
    expect(blueprintFromBrief('A CRM to track leads and deals').kind).toBe('app');
  });

  it('resolves loadAuthoringApis() to the same functions plus the deck layout catalog', async () => {
    const apis: AuthoringApis = await loadAuthoringApis();
    expect(apis.detectBriefKind).toBe(detectBriefKind);
    expect(apis.blueprintFromBrief).toBe(blueprintFromBrief);
    expect(apis.synthesizeContentFromBrief).toBe(synthesizeContentFromBrief);
    expect(apis.synthesizeDeckOutline).toBe(synthesizeDeckOutline);
    expect(apis.buildPageOutline).toBe(buildPageOutline);
    expect(apis.buildDocOutline).toBe(buildDocOutline);
    expect(apis.lintDeckStructure).toBe(lintDeckStructure);
    expect(apis.selectDeckLayouts).toBe(selectDeckLayouts);
    expect(apis.propsForSelectedLayout).toBe(propsForSelectedLayout);
    expect(apis.validateBlueprintForAuthoring).toBe(validateBlueprintForAuthoring);
    expect(apis.deckLayouts.map((layout) => layout.id)).toContain('title-hero');
    expect(apis.getDeckLayout('chart')?.id).toBe('chart');
    expect(apis.describeDeckLayouts()).toMatch(/^Deck layout catalog/);
  });
});

interface Bundle {
  /** Modules in the entry chunk and everything it imports statically. */
  initial: string[];
  /** Modules only reachable through dynamic imports. */
  lazy: string[];
  initialGzip: number;
}

const bundles = new Map<string, Bundle>();
let dir = '';

const ENTRIES = {
  /** A prototype runtime: parse an app blueprint, nothing else. */
  runtime: `import { parseBlueprint } from '@protoyard/blueprint';\nglobalThis.out = parseBlueprint;`,
  /** The player: parse any kind of blueprint. */
  kinds: `import { parseAnyBlueprint } from '@protoyard/blueprint';\nglobalThis.out = parseAnyBlueprint;`,
  /** An authoring tool importing the APIs statically. */
  authoring: `import { blueprintFromBrief, detectBriefKind, lintDeckStructure, selectDeckLayouts, validateBlueprintForAuthoring } from '@protoyard/blueprint';\nglobalThis.out = [blueprintFromBrief, detectBriefKind, lintDeckStructure, selectDeckLayouts, validateBlueprintForAuthoring];`,
  /** A browser tool that loads the authoring APIs on demand. */
  lazy: `import { parseAnyBlueprint, loadAuthoringApis } from '@protoyard/blueprint';\nglobalThis.out = [parseAnyBlueprint, loadAuthoringApis];`,
} as const;

function split(output: readonly (Rollup.OutputChunk | Rollup.OutputAsset)[]): Bundle {
  const chunks = output.filter((c): c is Rollup.OutputChunk => c.type === 'chunk');
  const byFile = new Map(chunks.map((c) => [c.fileName, c]));
  const entryChunk = chunks.find((c) => c.isEntry);
  if (!entryChunk) throw new Error('no entry chunk');
  const seen = new Set<string>();
  const queue = [entryChunk.fileName];
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const next of byFile.get(file)?.imports ?? []) queue.push(next);
  }
  const posix = (id: string) => id.replaceAll('\\', '/');
  const initialChunks = chunks.filter((c) => seen.has(c.fileName));
  return {
    initial: initialChunks.flatMap((c) => c.moduleIds).map(posix),
    lazy: chunks
      .filter((c) => !seen.has(c.fileName))
      .flatMap((c) => c.moduleIds)
      .map(posix),
    initialGzip: initialChunks.reduce((n, c) => n + gzipSync(c.code, { level: 9 }).length, 0),
  };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'protoyard-authoring-exports-'));
  // Linked like pnpm links it into a prototype, so `exports` and `sideEffects` apply.
  await mkdir(join(dir, 'node_modules/@protoyard'), { recursive: true });
  await symlink(join(ROOT, 'packages/blueprint'), join(dir, 'node_modules/@protoyard/blueprint'));
  for (const [name, code] of Object.entries(ENTRIES)) {
    const input = join(dir, `${name}.js`);
    await writeFile(input, code);
    const result = await build({
      root: dir,
      logLevel: 'silent',
      configFile: false,
      build: { write: false, minify: true, rollupOptions: { input } },
    });
    const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput;
    bundles.set(name, split(output.output));
  }
}, 180_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const bundle = (name: keyof typeof ENTRIES) => bundles.get(name) as Bundle;

describe('authoring code stays out of runtime bundles', () => {
  it('a runtime that only parses app blueprints bundles no authoring module and no layout catalog', () => {
    const { initial, lazy } = bundle('runtime');
    expect(initial.filter((id) => AUTHORING_MODULES.test(id))).toEqual([]);
    expect(initial.filter((id) => LAYOUT_CATALOG.test(id))).toEqual([]);
    expect(lazy).toEqual([]);
  });

  it('the kind union (player) bundles no authoring module', () => {
    expect(bundle('kinds').initial.filter((id) => AUTHORING_MODULES.test(id))).toEqual([]);
  });

  it('a static authoring import brings exactly the authoring modules it needs', () => {
    const authoring = bundle('authoring').initial.filter((id) => AUTHORING_MODULES.test(id));
    for (const file of [
      'src/brief/kind-detection.ts',
      'src/brief/synthesize.ts',
      'src/authoring/deck-lint.ts',
      'src/authoring/select-deck-layouts.ts',
      'src/authoring-validation.ts',
    ]) {
      expect(authoring.some((id) => id.endsWith(`packages/blueprint/${file}`))).toBe(true);
    }
  });

  it('loadAuthoringApis() keeps authoring code and the layout catalog in a lazy chunk', () => {
    const { initial, lazy } = bundle('lazy');
    expect(initial.filter((id) => AUTHORING_MODULES.test(id))).toEqual([]);
    expect(lazy.filter((id) => AUTHORING_MODULES.test(id)).length).toBeGreaterThanOrEqual(5);
    expect(lazy.some((id) => LAYOUT_CATALOG.test(id))).toBe(true);
    // The loader itself costs a few hundred bytes over the plain kind union.
    expect(bundle('lazy').initialGzip - bundle('kinds').initialGzip).toBeLessThan(2_048);
  });

  it('reports the measured sizes (gzip, level 9) for the README', () => {
    const sizes = {
      runtime: bundle('runtime').initialGzip,
      kinds: bundle('kinds').initialGzip,
      authoring: bundle('authoring').initialGzip,
      lazy: bundle('lazy').initialGzip,
    };
    // Measured 2026-10-21: runtime 39,273, kinds 41,604, authoring 80,231, lazy 42,077
    // (README → Authoring exports). Static authoring adds 38,627 over the kind union;
    // the ceiling is that plus about 7 %. Lower it when authoring shrinks.
    expect(sizes.runtime).toBeLessThanOrEqual(sizes.kinds);
    expect(sizes.authoring - sizes.kinds).toBeGreaterThan(0);
    expect(sizes.authoring - sizes.kinds).toBeLessThan(41_400);
    if (process.env.PROTOYARD_BUNDLE_DEBUG)
      process.stdout.write(`authoring-exports sizes ${JSON.stringify(sizes)}\n`);
  });
});
