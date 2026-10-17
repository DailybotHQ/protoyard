import type { PrototypeRuntime, Theme } from '@protoyard/core';
import { mount, unmount } from 'svelte';
import Panel from './Panel.svelte';

export interface MountDevtoolsOptions {
  runtime: PrototypeRuntime;
  /** Every theme the prototype can use (built-ins + prototype themes). */
  themes?: readonly Theme[];
  /** Defaults to a new element appended to `document.body`. */
  target?: HTMLElement;
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
  const component = mount(Panel, {
    target: host,
    props: { runtime: options.runtime, themes: options.themes ?? [] },
  });
  return {
    async destroy() {
      await unmount(component);
      if (!options.target) host.remove();
    },
  };
}
