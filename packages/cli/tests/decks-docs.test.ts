// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkInvocation, cliTree, extractInvocations } from '../../../scripts/check-skill-cli.ts';
import {
  DEFAULT_UNTRUSTED_DOCUMENT_LIMITS,
  lintDeckAssets,
  lintDeckStructure,
  loadUntrustedDocument,
} from '../../blueprint/src/index.ts';
import { DECK_BACKGROUND_PRESET_IDS } from '../../decks/src/backgrounds/index.ts';
import { DECK_TEXT_MINIMUMS } from '../../decks/src/canvas.ts';
import { DECK_LAYOUT_IDS } from '../../decks/src/layouts/index.ts';
import { DECK_TRANSITIONS, MAX_MOTION_MS } from '../../decks/src/motion/index.ts';
import { DECK_LIMITS } from '../../decks/src/schema/index.ts';
import { QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES } from '../src/lib/quick/single-file.ts';
import { createProgram } from '../src/program.ts';

/**
 * docs/DECKS.md, the deck guide: every command it shows runs (a real command
 * with real flags), every file it names exists, its example deck validates and
 * lints clean, it lists every catalog layout and catalog deck, and the
 * numbers in its limits match the code.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const text = readFileSync(join(REPO, 'docs', 'DECKS.md'), 'utf8');
const tree = cliTree(createProgram({ setExitCode: () => {} }));
const section = (heading: string) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  expect(start, heading).toBeGreaterThan(-1);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
};
const number = (value: number) => value.toLocaleString('en-US');

describe('docs/DECKS.md', () => {
  it('shows only protoyard commands and flags the real CLI has', () => {
    const invocations = extractInvocations(text, 'docs/DECKS.md');
    expect(invocations.length).toBeGreaterThan(12);
    expect(invocations.flatMap((invocation) => checkInvocation(tree, invocation))).toEqual([]);
  });

  it('names only test, spec, script and blueprint files that exist', () => {
    const paths = new Set(
      [
        ...text.matchAll(
          /\b((?:packages|scripts|tests|blueprints|templates)\/[\w./-]+\.(?:ts|json|svelte|md))\b/g
        ),
      ].map(([, path]) => path as string)
    );
    expect(paths.size).toBeGreaterThan(5);
    for (const path of paths) expect(existsSync(join(REPO, path)), path).toBe(true);
  });

  it('has an example deck that validates and lints without errors or warnings', async () => {
    // The whole example blueprint (the recipes are slides; docs-snippets.test.ts checks them).
    const block = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)]
      .map((match) => match[1] ?? '')
      .find((json) => json.includes('"kind": "deck"'));
    expect(block, 'the guide has a json example').toBeDefined();
    const loaded = await loadUntrustedDocument(block ?? '');
    expect(loaded.success, JSON.stringify(loaded.issues)).toBe(true);
    if (!loaded.success || !('kind' in loaded.blueprint) || loaded.blueprint.kind !== 'deck') {
      throw new Error('the example is not a deck');
    }
    const deck = loaded.blueprint.deck;
    expect(lintDeckStructure(deck).diagnostics).toEqual([]);
    expect(lintDeckAssets(deck).diagnostics).toEqual([]);
  });

  it('lists every catalog layout and every catalog deck', () => {
    const layouts = section('Layouts and when to use them');
    for (const id of DECK_LAYOUT_IDS) expect(layouts, id).toContain(`\`${id}\``);
    expect(layouts).toContain(`${DECK_LAYOUT_IDS.length} layouts`);
    const decks = readdirSync(join(REPO, 'blueprints', 'decks'))
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''));
    expect(decks.length).toBeGreaterThan(0);
    for (const deck of decks) expect(section('Start a deck'), deck).toContain(`\`${deck}\``);
  });

  it('states the limits the code enforces', () => {
    const limits = section('Limits');
    const doc = DEFAULT_UNTRUSTED_DOCUMENT_LIMITS;
    expect(doc.maxBytes).toBe(1024 * 1024);
    expect(limits).toContain(`1 MiB of UTF-8 JSON, nesting depth ${doc.maxDepth}`);
    expect(limits).toContain(`| ${number(DECK_LIMITS.slides)} |`);
    expect(limits).toContain(`${number(doc.maxBlocksPerSlide)} / ${number(doc.maxBlocks)}`);
    expect(limits).toContain(number(doc.maxChartPoints));
    expect(limits).toContain(`${doc.maxEmbeddedApps}, one level deep`);
    expect(limits).toContain(`| ${DECK_LIMITS.steps} (`);
    expect(limits).toContain(`${number(DECK_LIMITS.slideNotes)} characters`);
    expect(limits).toContain(`${DECK_LIMITS.slideTitle} characters`);
    expect(limits).toContain(
      `${DECK_TEXT_MINIMUMS.bodyPx} px body, ${DECK_TEXT_MINIMUMS.labelPx} px labels`
    );
    expect(QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES.deck).toBe(Math.round(2.65 * 1024 * 1024));
    expect(limits).toContain('| 2.65 MiB |');
  });

  it('names every transition, the motion cap and the background count', () => {
    const style = section('Customize a deck');
    for (const transition of DECK_TRANSITIONS)
      expect(style, transition).toContain(`\`${transition}\``);
    expect(style).toContain(`${MAX_MOTION_MS} ms`);
    expect(style).toContain(
      `the ${DECK_BACKGROUND_PRESET_IDS.length} \`DECK_BACKGROUND_PRESET_IDS\``
    );
  });

  it('documents what is unsupported and the report-only heuristics', () => {
    const missing = section('What decks do not do yet');
    for (const topic of [
      // Step reveals and the last step shipped in T-deck-fragments; what remains is listed.
      'Steps inside a chart do not hide',
      // Custom slides shipped in T-custom-slides; what remains is their level-1 placeholder.
      'custom slides run only at level 2',
      'media backgrounds',
      'Heuristics are report-only',
    ]) {
      expect(missing.toLowerCase(), topic).toContain(topic.toLowerCase());
    }
    expect(section('Check a deck')).toContain('**not calibrated**');
  });
});
