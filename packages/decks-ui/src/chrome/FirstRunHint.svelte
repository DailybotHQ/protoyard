<script lang="ts" module>
export {
  claimFirstRunHint,
  FIRST_RUN_HINT_MS,
  firstRunHintAllowed,
  firstRunHintKey,
  firstRunHintSeen,
} from './first-run.ts';
</script>

<script lang="ts">
import { deckControlFor } from '@protoyard/decks';
import { claimFirstRunHint, FIRST_RUN_HINT_MS, firstRunHintAllowed } from './first-run.ts';
import { onMount } from 'svelte';

/**
 * A deck's first-visit hint: how to move, go full screen and find every
 * control. It shows once per deck namespace, for 6 s or until the first key
 * or pointer input, and can be dismissed. It never takes focus, never
 * advances the deck, and is hidden in print; the host leaves it out of the
 * presenter and print layouts.
 */
let {
  namespace,
  container,
  storage = () => (typeof localStorage === 'undefined' ? null : localStorage),
}: {
  namespace: string;
  /** The deck root: the first input on it dismisses the hint. */
  container: HTMLElement | undefined;
  /** Injected for tests; defaults to `localStorage`. */
  storage?: () => Storage | null;
} = $props();

const move = [deckControlFor('prev'), deckControlFor('next')]
  .map((control) => control.keys[0]?.label)
  .filter(Boolean)
  .join(' ');
const full = deckControlFor('fullscreen').keys[0]?.label ?? 'F';
const help = deckControlFor('help').keys[0]?.label ?? '?';

let open = $state(false);

function dismiss(): void {
  open = false;
}

onMount(() => {
  if (!firstRunHintAllowed() || !claimFirstRunHint(namespace, storage)) return;
  open = true;
  const timer = setTimeout(dismiss, FIRST_RUN_HINT_MS);
  const target = container;
  // Capture: the deck's own handlers may stop the event.
  window.addEventListener('keydown', dismiss, true);
  target?.addEventListener('pointerdown', dismiss, true);
  target?.addEventListener('wheel', dismiss, { capture: true, passive: true });
  return () => {
    clearTimeout(timer);
    window.removeEventListener('keydown', dismiss, true);
    target?.removeEventListener('pointerdown', dismiss, true);
    target?.removeEventListener('wheel', dismiss, true);
  };
});
</script>

{#if open}
  <div class="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-4" data-py-deck-chrome data-py-deck-hint>
    <div class="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg" role="note">
      <p>
        Use <kbd class="rounded border border-border bg-muted px-1 font-mono text-xs">{move}</kbd> to move,
        <kbd class="rounded border border-border bg-muted px-1 font-mono text-xs">{full}</kbd> for full screen,
        <kbd class="rounded border border-border bg-muted px-1 font-mono text-xs">{help}</kbd> for every control.
      </p>
      <button
        type="button"
        class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md px-2 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onclick={dismiss}
      >
        Got it
      </button>
    </div>
  </div>
{/if}
