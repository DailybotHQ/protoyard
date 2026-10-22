import { type AnyBlueprint, blueprintIdentity, isContentBlueprint } from '@protoyard/blueprint';
import { defineKindRuntime } from '@protoyard/blueprint/kinds';
import { parseScenarioLink } from '@protoyard/core';
import type { DeckStudio } from '@protoyard/decks-ui/studio';
import {
  DEVTOOLS_ENABLED,
  type MountPrototypeOptions,
  mountPrototype,
} from '@protoyard/renderer-svelte';
import type { BootedPlayer } from './boot.ts';
import KindApp from './kinds/KindApp.svelte';
import { createMountEmbed } from './kinds/mount-embed.ts';
import { type KindDocument, setKindApp } from './kinds/state.ts';
import { QUICK_REVIEW_ENDPOINT } from './review-endpoint.ts';
import { markActiveExploration, recordExploration, resolvePlayerStorage } from './storage/index.ts';

/**
 * Boots a deck, page or doc (ADR-036): content identity and storage like an
 * app (`bp-…` namespace, or `?keep=`), then `defineKindRuntime` (one Dexie
 * version for block state and form responses, a `default` scenario, the
 * presenter / audience / viewer personas, no world generator and no worker)
 * and the shared kind renderer. This module never imports `./boot.ts` at run
 * time, so the CRUD shell, Faker and the world worker stay out of a kind's
 * download. Themes, shells, DevTools, the demo badge and review comments work
 * as for apps. A deck with DevTools on also gets Deck Studio (ADR-038).
 */

export interface BootKindOptions {
  blueprint: AnyBlueprint;
  target: HTMLElement;
  /** Overrides `location.search` (tests, embedding). */
  search?: string;
  /** Injected for tests; defaults to `@protoyard/runtime`. */
  createRuntime?: MountPrototypeOptions['createRuntime'];
  /** Injected IndexedDB for the player exploration index. */
  indexFactory?: IDBFactory;
  /** Opens the document in this storage namespace (live reload keeps its world). */
  namespace?: string;
  /** Accepted for parity with apps; kinds have one generator version. */
  generatorVersion?: number;
  /** Review comments through `quick serve`'s same-origin comments API. */
  review?: boolean;
  /** Force DevTools on or off (defaults to the build flag and `?devtools=0`, like mountPrototype). */
  devtools?: boolean;
}

/**
 * Deck Studio for a deck with DevTools on: its state (with the patch rooted
 * at `/deck`, the deck's place in a blueprint file) and its DevTools tab.
 * The studio module and its state load only here, never without DevTools.
 */
async function deckStudioFor(
  blueprint: KindDocument,
  devtools: boolean
): Promise<
  Pick<MountPrototypeOptions, 'devtoolsTabs'> & { studio?: DeckStudio; stop?: () => void }
> {
  if (!devtools || blueprint.kind !== 'deck') return {};
  const { createDeckStudio, deckStudioTab } = await import('@protoyard/decks-ui/studio');
  const studio = createDeckStudio(blueprint.deck, { pointer: '/deck' });
  return {
    studio,
    stop: studio.followHash(),
    devtoolsTabs: [
      deckStudioTab(studio) as NonNullable<MountPrototypeOptions['devtoolsTabs']>[number],
    ],
  };
}

/** `search` with `name=value` set (kept when already present). */
function withParam(search: string, name: string, value: string): string {
  const params = new URLSearchParams(search);
  if (!params.has(name)) params.set(name, value);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export async function bootKind(options: BootKindOptions): Promise<BootedPlayer> {
  const { blueprint, target } = options;
  if (!isContentBlueprint(blueprint)) {
    throw new Error('bootKind runs decks, pages and docs; apps boot through bootPlayer.');
  }
  const identity = await blueprintIdentity(blueprint);
  const search = options.search ?? location.search;
  const resolved = await resolvePlayerStorage(blueprint, identity, search);
  const storage = options.namespace ? { ...resolved, namespace: options.namespace } : resolved;
  const base = defineKindRuntime(blueprint, {
    namespace: storage.namespace,
    slug: storage.namespace,
  });
  const definition = options.review
    ? {
        ...base,
        manifest: {
          ...base.manifest,
          build: {
            ...base.manifest.build,
            review: { enabled: true, adapter: 'http' as const, endpoint: QUICK_REVIEW_ENDPOINT },
          },
        },
      }
    : base;
  const mountSearch = options.review ? withParam(search, 'comments', '1') : options.search;
  markActiveExploration(storage.namespace);
  try {
    await recordExploration(storage, options.indexFactory);
  } catch {
    // The index is convenience metadata; a blocked index must not hide the document.
  }
  const devtools =
    options.devtools ??
    (DEVTOOLS_ENABLED && parseScenarioLink(mountSearch ?? search).devtools !== false);
  const { studio, stop, devtoolsTabs } = await deckStudioFor(blueprint, devtools);
  setKindApp({
    blueprint,
    namespace: storage.namespace,
    mountEmbed: createMountEmbed(),
    ...(studio ? { studio } : {}),
  });
  const mounted = await mountPrototype({
    definition,
    App: KindApp,
    target,
    devtools,
    ...(devtoolsTabs ? { devtoolsTabs } : {}),
    ...(mountSearch !== undefined ? { search: mountSearch } : {}),
    ...(options.createRuntime ? { createRuntime: options.createRuntime } : {}),
    // Honest labelling: every player document says its data is simulated.
    build: { namespace: storage.namespace, demoBadge: true },
  });
  const destroy = mounted.destroy.bind(mounted);
  return Object.assign(mounted, {
    namespace: storage.namespace,
    generatorVersion: definition.generatorVersion,
    destroy: async () => {
      stop?.();
      await destroy();
    },
  });
}
