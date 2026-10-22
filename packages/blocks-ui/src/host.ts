import type { BlockStateHost } from '@protoyard/blocks/interactive';
import { getContext, setContext } from 'svelte';

export type BlockCanvasMode = 'flow' | 'slide';
export type BlockDensity = 'compact' | 'comfortable' | 'spacious';
export type MountEmbed = (
  target: HTMLElement,
  app: Record<string, unknown>
) => void | (() => void) | Promise<void> | Promise<() => void>;

/** CTA action payload after `safeHref` (structure family). */
export type BlockCtaAction = {
  label: string;
  href: string;
};

/** Context available to every family renderer. Optional capabilities stay host-owned. */
export interface BlockHostOptions {
  stateHost?: BlockStateHost;
  mountEmbed?: MountEmbed;
  density?: BlockDensity;
  canvasMode?: BlockCanvasMode;
  /** Current deck fragment step; code renderers use it for line highlights. */
  step?: number;
  /** Stable document namespace used when family renderers address block state. */
  documentId?: string;
  /**
   * Viewer (persona) id for poll and quiz votes. Supplied by the host from the
   * session, never by block content. Defaults to `viewer` in previews.
   */
  viewerId?: string;
  /**
   * Structure CTAs call this when set. Return a promise so the Button shows
   * pending feedback until it settles (AGENTS.md rule 5).
   */
  onCtaAction?: (action: BlockCtaAction) => void | Promise<void>;
}

export interface BlockHost extends BlockHostOptions {
  density: BlockDensity;
  canvasMode: BlockCanvasMode;
}

const BLOCK_HOST_CONTEXT = Symbol.for('@protoyard/blocks-ui/host');
const DEFAULT_BLOCK_HOST: BlockHost = Object.freeze({
  density: 'comfortable',
  canvasMode: 'flow',
});

/**
 * Set the render context from a host component during its initialization.
 * The context reads through to `host`, so a `$state` host (a deck's current
 * `step`, say) stays reactive in every block that reads it.
 */
export function setBlockHost(host: BlockHostOptions): void {
  const live: BlockHost = {
    get stateHost() {
      return host.stateHost;
    },
    get mountEmbed() {
      return host.mountEmbed;
    },
    get density() {
      return host.density ?? DEFAULT_BLOCK_HOST.density;
    },
    get canvasMode() {
      return host.canvasMode ?? DEFAULT_BLOCK_HOST.canvasMode;
    },
    get step() {
      return host.step;
    },
    get documentId() {
      return host.documentId;
    },
  };
  setContext(BLOCK_HOST_CONTEXT, live);
}

/** Read the nearest host context, with safe layout defaults for static blocks. */
export function getBlockHost(): BlockHost {
  return getContext<BlockHost>(BLOCK_HOST_CONTEXT) ?? DEFAULT_BLOCK_HOST;
}
