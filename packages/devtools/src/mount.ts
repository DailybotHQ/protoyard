import type { PrototypeRuntime, Theme } from '@protoyard/core';
import { enableTexuliAppearance } from '@protoyard/themes/texuli';
import type { Component } from 'svelte';
import { mount, unmount } from 'svelte';
import Panel from './Panel.svelte';
import type { AvatarImageResolver } from './state.svelte.ts';

export interface DevtoolsTab {
  id: string;
  label: string;
  icon: Component<{ class?: string }>;
  load: () => Promise<unknown>;
  props?: object;
}

export interface MountDevtoolsOptions {
  runtime: PrototypeRuntime;
  /** Every theme the prototype can use (built-ins + prototype themes). */
  themes?: readonly Theme[];
  /** Defaults to a new element appended to `document.body`. */
  target?: HTMLElement;
  /**
   * Resolves a `persona.avatar` to image props (the renderer passes its
   * `avatarImage`). Without it the persona list shows initials only.
   */
  avatarImage?: AvatarImageResolver;
  /** Additional tab entries. Each view module loads only after its tab is selected. */
  extraTabs?: readonly DevtoolsTab[];
}

export interface DevtoolsHandle {
  destroy(): Promise<void>;
}

/**
 * Mounts the panel in its own host element outside the app root, so the
 * app's layout (and viewport presets that narrow `#app`) never clip it.
 */
export function mountDevtools(options: MountDevtoolsOptions): DevtoolsHandle {
  const host = options.target ?? document.body.appendChild(document.createElement('div'));
  host.classList.add('py-devtools');
  host.dataset.protoyardDevtools = '';
  // Panel controls render Texuli components; keep --tx-* in sync with --py-*.
  enableTexuliAppearance();
  // Svelte delegates `click` & co. to the element it mounts into and walks the
  // event path from there; it stops at the first `stopPropagation()`. The
  // isolation listeners must therefore sit on an ANCESTOR of the mount point:
  // on the same element they would run first and cut the walk short, so a
  // click on a button's child (a persona's name or avatar) would never reach
  // the button's handler.
  const mountPoint = host.appendChild(document.createElement('div'));
  mountPoint.style.display = 'contents';
  const releaseIsolation = isolateFromAppLayers(host);
  const component = mount(Panel, {
    target: mountPoint,
    props: {
      runtime: options.runtime,
      themes: options.themes ?? [],
      ...(options.avatarImage ? { avatarImage: options.avatarImage } : {}),
      ...(options.extraTabs ? { extraTabs: options.extraTabs } : {}),
    },
  });
  return {
    async destroy() {
      await unmount(component);
      releaseIsolation();
      mountPoint.remove();
      if (!options.target) host.remove();
    },
  };
}

/**
 * App modals (Bits UI dialogs, sheets, popovers) trap focus with a
 * capture-phase `focusin` listener on `document` and dismiss on outside
 * pointer/focus events. DevTools must stay usable on top of them:
 *  - `focusin` from inside the panel is stopped at `window` (capture runs
 *    before `document`), so the trap never pulls focus back;
 *  - pointer/focus events bubbling out of the host are stopped, so the app
 *    layer doesn't treat panel clicks as "outside" and close itself.
 * Listeners on the host itself (Svelte's delegated handlers) still run.
 */
export function isolateFromAppLayers(host: HTMLElement): () => void {
  const inside = (event: Event) => event.composedPath().includes(host);
  const guardFocus = (event: FocusEvent) => {
    if (inside(event)) event.stopImmediatePropagation();
  };
  const stopBubble = (event: Event) => event.stopPropagation();
  const bubbling = ['pointerdown', 'mousedown', 'touchstart', 'click', 'focusin'] as const;
  window.addEventListener('focusin', guardFocus, true);
  for (const type of bubbling) host.addEventListener(type, stopBubble);
  return () => {
    window.removeEventListener('focusin', guardFocus, true);
    for (const type of bubbling) host.removeEventListener(type, stopBubble);
  };
}
