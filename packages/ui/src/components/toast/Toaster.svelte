<script lang="ts">
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from '@lucide/svelte';
import { cn } from '../../lib/cn.ts';
import { type ToastKind, toast } from './toast.svelte.ts';

interface Props {
  class?: string;
  /** Landmark label for the notification region. */
  label?: string;
  /**
   * Extra space below the toasts, for a bottom nav or a sticky composer: a
   * number of px or any CSS length. It sets `--py-toast-offset`; without it
   * the toasts read that variable from the page (default 0).
   */
  offset?: number | string;
}

let { class: className, label = 'Notifications', offset }: Props = $props();

const offsetValue = $derived(
  offset === undefined ? undefined : typeof offset === 'number' ? `${offset}px` : offset
);

const icons = { success: CircleCheck, error: CircleAlert, info: Info, warning: TriangleAlert };
const iconTone: Record<ToastKind, string> = {
  success: 'bg-success text-success-foreground',
  error: 'bg-destructive text-destructive-foreground',
  info: 'bg-info text-info-foreground',
  warning: 'bg-warning text-warning-foreground',
};

const politeText = $derived(
  toast.announcement && !toast.announcement.assertive ? toast.announcement.text : ''
);
const assertiveText = $derived(toast.announcement?.assertive ? toast.announcement.text : '');

function handleFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (!(next instanceof Node) || !(event.currentTarget as HTMLElement).contains(next)) {
    toast.resume();
  }
}
</script>

<!-- Live regions stay mounted so screen readers reliably announce new messages. -->
<div class="sr-only" aria-live="polite" aria-atomic="true">{politeText}</div>
<div class="sr-only" aria-live="assertive" aria-atomic="true">{assertiveText}</div>

<!--
  The region and the list are pointer-transparent, so taps in the gaps between
  toasts (and around them) reach the page; only the toasts themselves take
  pointer events. Toasts sit `--py-toast-offset` above the bottom and inside
  the visible right edge (`--py-fixed-right-edge`, set by the renderer).
-->
<section
  aria-label={label}
  class={cn(
    'pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4',
    'pb-[calc(max(1rem,env(safe-area-inset-bottom))+var(--py-toast-offset,0px))]',
    'right-[var(--py-fixed-right-edge,0px)]',
    'sm:left-auto sm:justify-end sm:px-6 sm:pt-6 sm:pb-[calc(1.5rem+var(--py-toast-offset,0px))]',
    className
  )}
  style:--py-toast-offset={offsetValue}
>
  {#if toast.items.length > 0}
    <ol
      class="pointer-events-none flex w-full max-w-sm flex-col gap-2"
      onmouseenter={toast.pause}
      onmouseleave={toast.resume}
      onfocusin={toast.pause}
      onfocusout={handleFocusOut}
    >
      {#each toast.items as item (item.id)}
        {@const Icon = icons[item.kind]}
        <li
          data-kind={item.kind}
          class="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-elevated p-3 pr-2 text-foreground shadow-float ui-anim-toast"
        >
          <span
            class={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full', iconTone[item.kind])}
            aria-hidden="true"
          >
            <Icon class="size-3.5" strokeWidth={2.5} />
          </span>
          <div class="grid min-w-0 flex-1 gap-0.5 pt-px">
            <p class="text-sm font-medium">{item.title}</p>
            {#if item.description}
              <p class="text-sm text-muted-foreground">{item.description}</p>
            {/if}
            {#if item.action}
              {@const action = item.action}
              <button
                type="button"
                class="mt-1 justify-self-start rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onclick={() => {
                  action.onClick();
                  toast.dismiss(item.id);
                }}
              >
                {action.label}
              </button>
            {/if}
          </div>
          <button
            type="button"
            class="-my-1 inline-flex size-8 min-h-touch min-w-[44px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0 sm:min-w-0"
            onclick={() => toast.dismiss(item.id)}
          >
            <X class="size-4" aria-hidden="true" />
            <span class="sr-only">Dismiss notification: {item.title}</span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</section>
