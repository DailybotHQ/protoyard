<script lang="ts">
import { Undo2, X } from '@lucide/svelte';
import { Portal } from 'bits-ui';
import { onMount } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import Button from '../button/Button.svelte';
import { installUndoToasterFocusExemption, UNDO_TOASTER_ATTR } from '../overlay/focus-exempt.ts';
import { useOverlayTopZIndex } from '../overlay/use-overlay-layer.svelte.ts';
import { undoToast } from './undo.svelte.ts';

interface Props {
  class?: string;
  /** Landmark label for the region. */
  label?: string;
}

let { class: className, label = 'Undo notifications' }: Props = $props();

const portal = useOverlayPortalTarget();
// Above every open drawer, so an undo offered from inside one stays visible.
const topZ = useOverlayTopZIndex();
const zIndex = $derived(Math.max(60, topZ.current));

// Install before any modal opens when possible (app-root toaster mounts first).
onMount(() => installUndoToasterFocusExemption());

const politeText = $derived(
  undoToast.announcement && !undoToast.announcement.assertive ? undoToast.announcement.text : ''
);
const assertiveText = $derived(
  undoToast.announcement?.assertive ? undoToast.announcement.text : ''
);

function handleFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (!(next instanceof Node) || !(event.currentTarget as HTMLElement).contains(next)) {
    undoToast.resume();
  }
}

// Escape anywhere inside a toast dismisses that toast (not an overlay behind it).
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !(event.target instanceof Element)) return;
  const id = event.target.closest<HTMLElement>('[data-undo-id]')?.dataset.undoId;
  if (!id) return;
  event.stopPropagation();
  undoToast.dismiss(id);
}
</script>

<Portal to={portal.current}>
  <!-- Live regions stay mounted so screen readers reliably announce new messages. -->
  <div class="sr-only" aria-live="polite" aria-atomic="true">{politeText}</div>
  <div class="sr-only" aria-live="assertive" aria-atomic="true">{assertiveText}</div>

  <section
    aria-label={label}
    {...{ [UNDO_TOASTER_ATTR]: '' }}
    style={`z-index:${zIndex}`}
    class={cn(
      'pointer-events-none fixed inset-x-0 bottom-0 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
      'sm:inset-x-auto sm:left-0 sm:justify-start sm:p-6',
      className
    )}
  >
    {#if undoToast.items.length > 0}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions (Escape is delegated from the focused Undo or Dismiss button inside a toast.) -->
      <ol
        class="pointer-events-auto flex w-full max-w-sm flex-col gap-2"
        onmouseenter={undoToast.pause}
        onmouseleave={undoToast.resume}
        onfocusin={undoToast.pause}
        onfocusout={handleFocusOut}
        onkeydown={handleKeydown}
      >
        {#each undoToast.items as item (item.id)}
          {@const hintId = `${item.id}-undo-hint`}
          <li
            data-undo-id={item.id}
            data-status={item.status}
            class="relative overflow-hidden rounded-lg border border-border bg-elevated text-foreground shadow-float ui-anim-toast"
          >
            <div class="flex items-center gap-2 p-3 pr-2">
              <div class="grid min-w-0 flex-1 gap-0.5">
                <p class="text-sm font-medium">{item.message}</p>
                {#if item.description}
                  <p class="text-sm text-muted-foreground">{item.description}</p>
                {/if}
                {#if item.error}
                  <p class="text-sm text-destructive">{item.error}</p>
                {/if}
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="shrink-0 font-semibold text-primary"
                aria-describedby={hintId}
                loadingLabel="Undoing"
                onclick={() => undoToast.undo(item.id)}
              >
                <Undo2 aria-hidden="true" />
                {item.status === 'failed' ? `Retry ${item.undoLabel.toLowerCase()}` : item.undoLabel}
              </Button>
              <span id={hintId} class="sr-only">
                Available for {Math.round(item.duration / 1000)} seconds. {item.message}.
              </span>
              <button
                type="button"
                class="inline-flex size-8 min-h-touch min-w-[44px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 sm:min-h-0 sm:min-w-0"
                disabled={item.status === 'undoing'}
                onclick={() => undoToast.dismiss(item.id)}
              >
                <X class="size-4" aria-hidden="true" />
                <span class="sr-only">Dismiss: {item.message}</span>
              </button>
            </div>
            {#key item.revision}
              <div
                class="ui-undo-countdown absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary"
                style={`animation-duration:${item.duration}ms;animation-play-state:${undoToast.paused || item.status === 'undoing' ? 'paused' : 'running'}`}
                aria-hidden="true"
              ></div>
            {/key}
          </li>
        {/each}
      </ol>
    {/if}
  </section>
</Portal>

<style>
  .ui-undo-countdown {
    animation-name: ui-undo-countdown;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }
  /* A bar that jumps to empty would mislead; without motion the hint text carries the window. */
  @media (prefers-reduced-motion: reduce) {
    .ui-undo-countdown {
      display: none;
    }
  }
  :global([data-py-motion='reduce']) .ui-undo-countdown {
    display: none;
  }
  @keyframes ui-undo-countdown {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
</style>
