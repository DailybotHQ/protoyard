<script lang="ts">
import { copyText } from './clipboard.ts';
import type { DeckToolAction } from './types.ts';

/**
 * The presenting tools as real buttons, mirroring the keys (B, F, L, ?) so
 * pointer and touch users reach every tool. Toggles report their state with
 * `aria-pressed`; the help button with `aria-expanded`. The copy result is
 * announced in a polite live region and never claims success it did not get.
 */
let {
  blackout = false,
  laser = false,
  help = false,
  fullscreen = false,
  fullscreenAvailable = true,
  helpId,
  reference,
  onaction,
}: {
  blackout?: boolean;
  laser?: boolean;
  help?: boolean;
  fullscreen?: boolean;
  /** Hide the full-screen button where the browser has no Fullscreen API (no dead control). */
  fullscreenAvailable?: boolean;
  /** id of the help dialog, for `aria-controls`. */
  helpId?: string;
  /** The slide reference to copy, read at click time. */
  reference: () => string;
  onaction: (action: DeckToolAction) => void;
} = $props();

let copyStatus = $state<'idle' | 'copied' | 'failed'>('idle');
let copyTimer: ReturnType<typeof setTimeout> | undefined;

async function copyReference(): Promise<void> {
  clearTimeout(copyTimer);
  copyStatus = (await copyText(reference())) ? 'copied' : 'failed';
  copyTimer = setTimeout(() => {
    copyStatus = 'idle';
  }, 2_500);
}

$effect(() => () => clearTimeout(copyTimer));

const button =
  'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-border bg-background/85 px-2 text-xs font-medium text-foreground backdrop-blur transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:border-primary';
</script>

<div class="pointer-events-auto flex shrink-0 items-center gap-1" role="toolbar" aria-label="Presenting tools" data-py-deck-toolbar>
  <button
    type="button"
    class={button}
    aria-pressed={blackout}
    aria-keyshortcuts="B"
    title="Black out the screen (B)"
    data-py-deck-tool="blackout"
    onclick={() => onaction('blackout')}
  >
    <span aria-hidden="true">■</span><span class="sr-only">Black out the screen</span>
  </button>
  {#if fullscreenAvailable}
    <button
      type="button"
      class={button}
      aria-pressed={fullscreen}
      aria-keyshortcuts="F"
      title={fullscreen ? 'Leave full screen (F)' : 'Full screen (F)'}
      data-py-deck-tool="fullscreen"
      onclick={() => onaction('fullscreen')}
    >
      <span aria-hidden="true">⛶</span><span class="sr-only">Full screen</span>
    </button>
  {/if}
  <button
    type="button"
    class={button}
    aria-pressed={laser}
    aria-keyshortcuts="L"
    title="Laser pointer (L)"
    data-py-deck-tool="laser"
    onclick={() => onaction('laser')}
  >
    <span aria-hidden="true">◉</span><span class="sr-only">Laser pointer</span>
  </button>
  <button
    type="button"
    class={button}
    title="Copy a reference to this slide"
    data-py-deck-tool="copy-reference"
    onclick={copyReference}
  >
    <span aria-hidden="true">⧉</span><span class="sr-only">Copy slide reference</span>
  </button>
  <button
    type="button"
    class={button}
    aria-expanded={help}
    aria-controls={helpId}
    aria-keyshortcuts="Shift+?"
    title="Keyboard shortcuts (?)"
    data-py-deck-tool="help"
    onclick={() => onaction('help')}
  >
    <span aria-hidden="true">?</span><span class="sr-only">Keyboard shortcuts</span>
  </button>
  <span class="sr-only" role="status" aria-live="polite" data-py-deck-copy-status>
    {copyStatus === 'copied'
      ? 'Slide reference copied'
      : copyStatus === 'failed'
        ? 'Could not copy the slide reference'
        : ''}
  </span>
</div>
