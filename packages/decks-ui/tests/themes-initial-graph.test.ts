import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildDeckEntry,
  cleanupDeckBuild,
  type DeckBuild,
  initialChunks,
  posix,
} from './bundle-support.ts';

/**
 * A deck paints one theme at first, so its first chunk must not carry the
 * theme library (`@texuli/tokens` library port and expanded set) or the
 * palette generator. They used to arrive through two eager paths, about
 * 16 KB gzip on create-anything-deck: Deck Studio's choices
 * (`deckStudioOptions`, now built by the lazy panel) and the kind runtime's
 * brand resolution (`defineKindRuntime`; generated decks now call
 * `defineKindPrototype` with the theme `protoyard generate` resolved).
 */
const LIBRARY_OR_GENERATOR =
  /@texuli\/tokens\/dist\/(?:library-port|library-expand|library|generator)\//;

/** A generated deck's first paint (src/main.ts, App.svelte, prototype.ts), without the renderer. */
const GENERATED_DECK_MAIN = `import { mount } from 'svelte';
import { defineKindPrototype } from '@protoyard/blueprint/kinds';
import { DeckApp } from '@protoyard/decks-ui/app';
import { createDeckStudio, deckStudioTab } from '@protoyard/decks-ui/studio';
import { BUILTIN_THEMES, getTheme, mergeThemes } from '@protoyard/themes';
import '@protoyard/decks-ui/styles.css';

const deck = { id: 'fixture', title: 'Fixture', style: {}, slides: [] };
const definition = defineKindPrototype({ kind: 'deck', name: 'Fixture', deck } as never, {
  namespace: 'fixture',
  defaultThemeId: null,
  brandTheme: null,
});
const studio = createDeckStudio(deck as never);
Object.assign(globalThis, {
  fixture: { definition, tab: deckStudioTab(studio), theme: getTheme(undefined), themes: mergeThemes(BUILTIN_THEMES) },
});
mount(DeckApp, { target: document.getElementById('app')!, props: { deck: studio.preview } });
`;

const TEMPLATES = resolve(import.meta.dirname, '../../../templates');

/**
 * A prototype from \`protoyard new --template deck|page|doc\`: each template's
 * runtime definition (the deck one with its seeded brand, resolved ahead in
 * src/brand-theme.ts) and the deck template's Studio state.
 */
const TEMPLATES_MAIN = `import { definition as deck } from '${TEMPLATES}/deck/src/prototype.ts';
import { createTemplateDeckStudio } from '${TEMPLATES}/deck/src/deck-studio.ts';
import { deckBlueprint } from '${TEMPLATES}/deck/src/deck-blueprint.ts';
import { definition as page } from '${TEMPLATES}/page/src/prototype.ts';
import { definition as doc } from '${TEMPLATES}/doc/src/prototype.ts';

Object.assign(globalThis, {
  fixture: { deck, page, doc, studio: createTemplateDeckStudio(deckBlueprint.deck, '', true) },
});
`;

/** The eager paths this test guards against: proves the pattern finds them. */
const EAGER_CONTROL_MAIN = `import { defineKindRuntime } from '@protoyard/blueprint/kinds';
import { deckStudioOptions } from '@protoyard/decks/patch';

Object.assign(globalThis, { fixture: { defineKindRuntime, options: deckStudioOptions() } });
`;

const builds: { dir: string; output: DeckBuild }[] = [];
let deck: DeckBuild;
let control: DeckBuild;
let templates: DeckBuild;

const moduleIds = (chunks: readonly { moduleIds: readonly string[] }[]) =>
  chunks.flatMap((chunk) => chunk.moduleIds.map(posix));

beforeAll(async () => {
  const [deckBuild, controlBuild, templatesBuild] = await Promise.all([
    buildDeckEntry(GENERATED_DECK_MAIN),
    buildDeckEntry(EAGER_CONTROL_MAIN),
    buildDeckEntry(TEMPLATES_MAIN),
  ]);
  builds.push(deckBuild, controlBuild, templatesBuild);
  deck = deckBuild.output;
  control = controlBuild.output;
  templates = templatesBuild.output;
}, 600_000);

afterAll(async () => {
  await Promise.all(builds.map((build) => cleanupDeckBuild(build.dir)));
});

describe('deck initial graph: one theme at first paint', () => {
  it('has no theme library or palette generator module', () => {
    const initial = moduleIds(initialChunks(deck));
    expect(initial.some((id) => id.includes('/packages/themes/src/presets.ts'))).toBe(true);
    expect(initial.filter((id) => LIBRARY_OR_GENERATOR.test(id))).toEqual([]);
  });

  it('still ships the library catalog, lazily, with the Deck Studio panel', () => {
    const initial = new Set(initialChunks(deck).map((chunk) => chunk.fileName));
    const lazy = deck.chunks.filter((chunk) => !initial.has(chunk.fileName));
    expect(moduleIds(lazy).some((id) => /library-port\/records\.js$/.test(id))).toBe(true);
  });

  it('has none in a prototype made from the deck, page or doc template', () => {
    const initial = moduleIds(initialChunks(templates));
    for (const kind of ['deck', 'page', 'doc']) {
      expect(
        initial.some((id) => id.endsWith(`/templates/${kind}/src/prototype.ts`)),
        kind
      ).toBe(true);
    }
    expect(initial.some((id) => id.endsWith('/templates/deck/src/brand-theme.ts'))).toBe(true);
    expect(initial.filter((id) => LIBRARY_OR_GENERATOR.test(id))).toEqual([]);
  });

  it('catches the eager paths (control build)', () => {
    const initial = moduleIds(initialChunks(control));
    expect(initial.some((id) => /\/generator\//.test(id) && LIBRARY_OR_GENERATOR.test(id))).toBe(
      true
    );
    expect(initial.some((id) => /library-port\//.test(id))).toBe(true);
  });
});
