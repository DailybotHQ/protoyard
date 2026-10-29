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

/** The eager paths this test guards against: proves the pattern finds them. */
const EAGER_CONTROL_MAIN = `import { defineKindRuntime } from '@protoyard/blueprint/kinds';
import { deckStudioOptions } from '@protoyard/decks/patch';

Object.assign(globalThis, { fixture: { defineKindRuntime, options: deckStudioOptions() } });
`;

const builds: { dir: string; output: DeckBuild }[] = [];
let deck: DeckBuild;
let control: DeckBuild;

const moduleIds = (chunks: readonly { moduleIds: readonly string[] }[]) =>
  chunks.flatMap((chunk) => chunk.moduleIds.map(posix));

beforeAll(async () => {
  const [deckBuild, controlBuild] = await Promise.all([
    buildDeckEntry(GENERATED_DECK_MAIN),
    buildDeckEntry(EAGER_CONTROL_MAIN),
  ]);
  builds.push(deckBuild, controlBuild);
  deck = deckBuild.output;
  control = controlBuild.output;
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

  it('catches the eager paths (control build)', () => {
    const initial = moduleIds(initialChunks(control));
    expect(initial.some((id) => /\/generator\//.test(id) && LIBRARY_OR_GENERATOR.test(id))).toBe(
      true
    );
    expect(initial.some((id) => /library-port\//.test(id))).toBe(true);
  });
});
