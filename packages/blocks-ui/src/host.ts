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

/** How a stepped block looks at the host's current step (decks only). */
export interface BlockFragmentPhase {
  /** Shown at all (hidden blocks keep their space, so nothing jumps). */
  visible: boolean;
  /** Its effect is applied (a highlight is on, a strike is drawn, a grow has grown). */
  active: boolean;
}

/** A block as the step callbacks see it: its own `step` and `reveal` fields. */
export interface SteppedBlock {
  type: string;
  step?: number;
  reveal?: string;
}

/** Context available to every family renderer. Optional capabilities stay host-owned. */
export interface BlockHostOptions {
  stateHost?: BlockStateHost;
  mountEmbed?: MountEmbed;
  density?: BlockDensity;
  canvasMode?: BlockCanvasMode;
  /** Current deck fragment step; code renderers use it for line highlights. */
  step?: number;
  /**
   * Decks: the phase of a block that has a `step`, at the current step, or
   * `null` when the block is not stepped. Without it (pages, docs) every
   * block is always shown.
   */
  fragment?: (block: SteppedBlock) => BlockFragmentPhase | null;
  /**
   * Decks: the index into a code block's `highlights` shown at the current
   * step (−1 for none). Without it, code blocks fall back to `step`.
   */
  codeHighlight?: (block: SteppedBlock & { highlights?: readonly string[] }) => number;
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
    get fragment() {
      return host.fragment;
    },
    get codeHighlight() {
      return host.codeHighlight;
    },
    get documentId() {
      return host.documentId;
    },
    get viewerId() {
      return host.viewerId;
    },
    get onCtaAction() {
      return host.onCtaAction;
    },
  };
  setContext(BLOCK_HOST_CONTEXT, live);
}

/** Read the nearest host context, with safe layout defaults for static blocks. */
export function getBlockHost(): BlockHost {
  return getContext<BlockHost>(BLOCK_HOST_CONTEXT) ?? DEFAULT_BLOCK_HOST;
}

/**
 * True when the nearest host is the security-fuzz harness (`documentId:
 * 'security-fuzz'`). Chart and map kits skip full `@protoyard/charts-ui` /
 * `@protoyard/views-ui/map` mounts there: Texuli chart families OOM happy-dom
 * across the 2,000-document fuzz. Callers still render an inert mark so the
 * fuzz assertions can prove the path stayed script-free.
 */
export function isSecurityFuzzHost(): boolean {
  return getBlockHost().documentId === 'security-fuzz';
}

/**
 * Wrapper attributes for a stepped block at the host's current step, or
 * `null` when the block shows as is. A hidden block keeps its space (no jump),
 * is `inert` and `aria-hidden` until its step, then transitions in with its
 * `reveal` effect. `prefers-reduced-motion` and a deck's `motion: none`
 * (`data-py-deck-motion="none"` on an ancestor) drop the motion.
 */
export function fragmentAttributes(
  host: BlockHost,
  block: SteppedBlock
): Record<string, string | boolean | undefined> | null {
  const phase = host.fragment?.(block) ?? null;
  if (!phase) return null;
  const reveal = block.reveal ?? 'fade';
  const style = [
    'transform-origin:0',
    'transition-property:opacity,transform,background-color,box-shadow,translate,scale',
    'transition-duration:500ms',
    'transition-timing-function:var(--py-motion-easing,cubic-bezier(.4,0,.2,1))',
    phase.visible ? 'visibility:visible;opacity:1' : 'visibility:hidden;opacity:0',
    !phase.visible && reveal === 'fade-up' ? 'translate:0 .6em' : '',
    phase.active && reveal === 'grow' ? 'scale:1.04' : '',
    phase.active && reveal === 'highlight'
      ? 'border-radius:calc(var(--py-radius) - var(--py-radius-step-2,2px));background-color:color-mix(in oklab,var(--py-primary) 10%,transparent);--tw-ring-color:color-mix(in oklab,var(--py-primary) 50%,transparent);--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow),var(--tw-inset-ring-shadow),var(--tw-ring-offset-shadow),var(--tw-ring-shadow),var(--tw-shadow)'
      : '',
    phase.active && reveal === 'strike' ? 'text-decoration-line:line-through;opacity:.6' : '',
  ]
    .filter(Boolean)
    .join(';');
  return {
    class: 'py-deck-fragment',
    style,
    'data-py-fragment': phase.visible ? 'shown' : 'hidden',
    'data-py-fragment-active': phase.active ? 'true' : undefined,
    'data-py-fragment-reveal': reveal,
    'aria-hidden': phase.visible ? undefined : 'true',
    inert: !phase.visible,
  };
}
