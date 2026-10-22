import type { MountEmbed } from '@protoyard/blocks-ui';

/**
 * `mountEmbed` for embed-app blocks in decks, pages and docs (ADR-037): the
 * app runs in a frame of this same player, which receives it over
 * `protoyard-player/1`. A frame gives the embedded app its own runtime, its
 * own content namespace (`bp-…` from its identity) and its own URL hash, so it
 * never fights the deck for routing or storage. Before anything starts, the
 * app is checked with `loadUntrustedBlueprint`: app kind only, which keeps
 * embedding to one level (an app cannot hold blocks).
 */

export interface MountEmbedOptions {
  /** The player page the frame opens (default: `./index.html` next to this page, DevTools off). */
  playerUrl?: () => URL;
  /** Injected for tests. */
  connect?: typeof import('../embed/client.ts').connectPlayer;
}

export function createMountEmbed(options: MountEmbedOptions = {}): MountEmbed {
  return async (target, app) => {
    // Destructured at the import: only the app loader, not the whole barrel.
    const { loadUntrustedBlueprint } = await import('@protoyard/blueprint');
    const loaded = loadUntrustedBlueprint(app);
    if (!loaded.success) {
      const first = loaded.issues[0];
      throw new Error(first ? `${first.message} ${first.fix}` : 'The embedded app is not valid.');
    }
    const url =
      options.playerUrl?.() ?? new URL('./index.html?devtools=0', globalThis.location.href);
    if (url.origin !== globalThis.location.origin || !/^https?:$/.test(url.protocol)) {
      throw new Error('Embedded apps need the player served over http(s) from one origin.');
    }
    const frame = document.createElement('iframe');
    frame.src = url.href;
    frame.title = loaded.blueprint.name;
    frame.className = 'block h-full w-full border-0';
    frame.setAttribute('loading', 'lazy');
    target.replaceChildren(frame);
    const connect = options.connect ?? (await import('../embed/client.ts')).connectPlayer;
    const connection = connect({ frame, playerOrigin: url.origin });
    try {
      await connection.ready;
      await connection.load(loaded.blueprint);
    } catch (error) {
      connection.close();
      frame.remove();
      throw error;
    }
    return () => {
      connection.close();
      frame.remove();
    };
  };
}
