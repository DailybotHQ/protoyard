import { type AnyBlueprint, isAppBlueprint } from '@protoyard/blueprint';
import { mount, unmount } from 'svelte';
import type { BootedPlayer } from '../boot.ts';
import { type BootExtras, type RunningPlayer, runPlayer } from '../run.ts';
import { loadKindBoot } from '../sources/boot-any.ts';
import KindMismatch from './KindMismatch.svelte';

/**
 * The per-kind player pages (`deck.html`, `page.html`, `doc.html`): the same
 * source resolution, live reload and embedding as `index.html` (run.ts), but
 * every blueprint boots through the kind boot only, so the page never
 * references the app boot (CRUD shell, Faker, world worker). A blueprint of
 * another kind gets a screen that says so and links to the page that runs it
 * (`index.html` for an app), keeping the same `?src=` and share link.
 */

export type EntryKind = 'deck' | 'page' | 'doc';
export type BlueprintKind = 'app' | EntryKind;

/** A blueprint's kind; an app may leave `kind` out. */
export function kindOf(blueprint: AnyBlueprint): BlueprintKind {
  return isAppBlueprint(blueprint) ? 'app' : blueprint.kind;
}

/** The player page that runs each blueprint kind. */
export const KIND_ENTRY_PAGES: Record<BlueprintKind, string> = {
  app: 'index.html',
  deck: 'deck.html',
  page: 'page.html',
  doc: 'doc.html',
};

/** Where the blueprint this page could not run opens instead (same query and hash). */
export function entryUrlFor(
  kind: BlueprintKind,
  location: Pick<Location, 'href' | 'search' | 'hash'>
): string {
  const url = new URL(`./${KIND_ENTRY_PAGES[kind]}`, location.href);
  url.search = location.search;
  url.hash = location.hash;
  return url.href;
}

/** A running mismatch screen in the shape run.ts tears down (`destroy`). */
async function showMismatch(
  expected: EntryKind,
  blueprint: AnyBlueprint,
  target: HTMLElement,
  location: Pick<Location, 'href' | 'search' | 'hash'>
): Promise<BootedPlayer> {
  target.replaceChildren();
  document.documentElement.dataset.pyReady = 'error';
  const actual = kindOf(blueprint);
  const screen = mount(KindMismatch, {
    target,
    props: { expected, actual, name: blueprint.name, href: entryUrlFor(actual, location) },
  });
  return {
    namespace: '',
    generatorVersion: undefined,
    runtime: null,
    error: null,
    destroy: async () => {
      await unmount(screen);
      target.replaceChildren();
    },
  };
}

export interface KindEntryOptions {
  kind: EntryKind;
  window: Window;
  target: HTMLElement;
  /** Injected for tests (defaults to run.ts). */
  run?: typeof runPlayer;
  /** Injected for tests (defaults to the lazy kind boot chunk). */
  loadBoot?: () => Promise<Pick<typeof import('../boot-kind.ts'), 'bootKind'>>;
}

/** Boots `blueprint` when it is this page's kind; otherwise shows where it runs. */
export function kindEntryBoot(
  options: Pick<KindEntryOptions, 'kind' | 'window' | 'loadBoot'>
): (blueprint: AnyBlueprint, target: HTMLElement, extras?: BootExtras) => Promise<BootedPlayer> {
  const load = options.loadBoot ?? loadKindBoot;
  return async (blueprint, target, extras = {}) => {
    if (kindOf(blueprint) !== options.kind) {
      return showMismatch(options.kind, blueprint, target, options.window.location);
    }
    const { bootKind } = await load();
    return bootKind({ blueprint, target, ...extras });
  };
}

export function runKindEntry(options: KindEntryOptions): Promise<RunningPlayer> {
  // Fetch the kind boot while the source resolves (a kind page always needs it).
  void (options.loadBoot ?? loadKindBoot)().catch(() => undefined);
  const run = options.run ?? runPlayer;
  return run({ window: options.window, target: options.target, boot: kindEntryBoot(options) });
}
