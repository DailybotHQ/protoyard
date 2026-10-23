import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildDeckEntry,
  cleanupDeckBuild,
  type DeckBuild,
  gzip,
  initialChunks,
  KB_PER_BYTE,
  posix,
  sumGzip,
} from './bundle-support.ts';

/**
 * AC-deck-style-budget: applying deck.style keeps DeckApp's initial JS
 * within its 120 KB gzip budget. The style kit (deck style resolution, the
 * palette engine, the library theme catalog and the background resolver)
 * is a lazy chunk, and each library theme's tokens build in a further one.
 */

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

const hasModule = (chunk: DeckBuild['chunks'][number], fragment: string) =>
  chunk.moduleIds.some((id) => posix(id).includes(fragment));

describe('deck style budget (production Vite build)', () => {
  it('keeps the initial JS within 120 KB gzip', () => {
    const bytes = sumGzip(initialChunks(output));
    console.info(
      `deck app initial JS with style application: ${Math.ceil(bytes * KB_PER_BYTE)} KB gzip (${bytes} B)`
    );
    expect(bytes).toBeLessThanOrEqual(120 * 1024);
  });

  it('keeps style resolution and library themes out of the initial graph', () => {
    const initial = initialChunks(output);
    for (const fragment of [
      '/decks-ui/src/style/kit.ts',
      '/decks/src/style/index.ts',
      '/themes/src/library/definitions',
      // Library tokens come from @texuli/tokens: its definitions and builder.
      '/tokens/src/library-port/themes/',
      '/tokens/src/library-expand/themes/',
      '/tokens/src/library-port/build.ts',
      '/decks/src/backgrounds/resolve.ts',
    ]) {
      expect(
        initial.some((chunk) => hasModule(chunk, fragment)),
        fragment
      ).toBe(false);
    }
  });

  it('ships the style kit and library theme builder as lazy chunks', () => {
    const lazy = output.chunks.filter((chunk) => chunk.isDynamicEntry);
    const kit = lazy.find((chunk) => hasModule(chunk, '/decks-ui/src/style/kit.ts'));
    expect(kit, 'style kit chunk').toBeDefined();
    expect(
      lazy.some((chunk) => hasModule(chunk, '/tokens/src/library-port/build.ts')),
      'library theme builder'
    ).toBe(true);
    console.info(`deck style kit chunk: ${Math.ceil(gzip(kit?.code ?? '') * KB_PER_BYTE)} KB gzip`);
  });
});
