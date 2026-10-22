import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Level 1 and level 2 must agree on what an embedded app is: the player's
 * `mountEmbed` goes through `loadEmbeddedApp` (app kind only, and no embed-app
 * block anywhere inside, so embedding stays one level deep), never the plain
 * app loader alone.
 */
const loadEmbeddedApp = vi.fn();
vi.mock('@protoyard/blueprint/kinds/embed', () => ({ loadEmbeddedApp }));

afterEach(() => {
  loadEmbeddedApp.mockReset();
  document.body.replaceChildren();
});

describe('player mountEmbed uses the level-two embedded-app loader', () => {
  it('refuses what loadEmbeddedApp refuses, before any frame or connection', async () => {
    loadEmbeddedApp.mockReturnValue({
      success: false,
      blueprint: null,
      issues: [
        {
          code: 'too-deep',
          path: [],
          message: 'An embedded app cannot embed another app (one level only).',
          fix: 'Remove the nested embed-app block.',
        },
      ],
    });
    const { createMountEmbed } = await import('../src/kinds/mount-embed.ts');
    const connect = vi.fn();
    const target = document.body.appendChild(document.createElement('div'));
    const mount = createMountEmbed({
      connect: connect as never,
      playerUrl: () => new URL('./index.html?devtools=0', globalThis.location.href),
    });
    const app = { formatVersion: 1, name: 'Nested' };
    await expect(mount(target, app)).rejects.toThrow(/one level only/);
    expect(loadEmbeddedApp).toHaveBeenCalledWith(app);
    expect(connect).not.toHaveBeenCalled();
    expect(target.querySelector('iframe')).toBeNull();
  });
});
