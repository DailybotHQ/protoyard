<script lang="ts" module>
/** How long a toast stays on screen, unless the pointer or focus is on it. */
export const TOAST_DURATION_MS = 2500;

export type ToastTone = 'info' | 'error';
</script>

<script lang="ts">
/**
 * The deck's one feedback message: a polite live region for assistive tech
 * and its visible twin, so an action that changes nothing on the slide
 * (copying a reference) still visibly answers. A new message replaces the
 * current one (no stacking); it stays 2.5 s, paused while the pointer is on it
 * (it never takes focus: keyboard and screen-reader users get the live region).
 * Text only. Call `show(message, tone)` through `bind:this`.
 */
let message = $state('');
let tone = $state<ToastTone>('info');
let visible = $state(false);
let paused = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (paused) return;
    visible = false;
    message = '';
  }, TOAST_DURATION_MS);
}

export function show(next: string, nextTone: ToastTone = 'info'): void {
  // Clear first so a repeated message is announced again.
  message = '';
  queueMicrotask(() => {
    message = next;
    tone = nextTone;
    visible = true;
    schedule();
  });
}

function pause(): void {
  paused = true;
  clearTimeout(timer);
}

function resume(): void {
  paused = false;
  if (visible) schedule();
}

$effect(() => () => clearTimeout(timer));
</script>

<span class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-py-deck-copy-status data-py-deck-toast-live>{message}</span>

{#if visible && message}
  <div class="pointer-events-none absolute inset-x-0 bottom-20 z-50 flex justify-center px-4 print:hidden" data-py-deck-chrome>
    <div
      class={`pointer-events-auto max-w-sm rounded-md border px-3 py-2 text-sm font-medium shadow-lg motion-safe:transition-opacity ${tone === 'error' ? 'border-destructive bg-background text-destructive' : 'border-border bg-popover text-popover-foreground'}`}
      aria-hidden="true"
      data-py-deck-toast
      data-tone={tone}
      onpointerenter={pause}
      onpointerleave={resume}
    >
      {message}
    </div>
  </div>
{/if}
