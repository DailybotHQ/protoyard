<script lang="ts">
import { Button, Dialog, DropdownMenu, type DropdownMenuEntry } from '@protoyard/ui';
import type { Snippet } from 'svelte';

type Props = {
  title: string;
  description?: string;
  /** Widget actions (rename, duplicate, remove…); each item runs its own service. */
  menu?: DropdownMenuEntry[];
  loading?: boolean;
  /** `true` or a message: nothing to show yet. */
  empty?: boolean | string;
  /** A message: the widget's data failed to load. */
  error?: string | null;
  /** Retry for the error state; return the promise so the button shows pending feedback. */
  onretry?: () => unknown;
  /** Offer a full-screen view of the same content (default true). */
  expandable?: boolean;
  /** The widget body; `expanded` is true inside the full-screen view. */
  children?: Snippet<[{ expanded: boolean }]>;
  class?: string;
};

let {
  title,
  description,
  menu = [],
  loading = false,
  empty = false,
  error = null,
  onretry,
  expandable = true,
  children,
  class: className = '',
}: Props = $props();

const uid = $props.id();
let expanded = $state(false);
const emptyMessage = $derived(typeof empty === 'string' ? empty : 'No data yet');
</script>

{#snippet body(isExpanded: boolean)}
  {#if loading}
    <div role="status" aria-label="Loading {title}" class="flex flex-1 flex-col gap-2 p-1">
      <div class="h-4 w-1/3 animate-pulse rounded bg-muted"></div>
      <div class="flex-1 animate-pulse rounded-lg bg-muted"></div>
    </div>
  {:else if error}
    <div role="alert" class="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p class="text-sm font-medium text-destructive">{error}</p>
      {#if onretry}
        <Button variant="outline" size="sm" onclick={() => onretry()}>Retry</Button>
      {/if}
    </div>
  {:else if empty}
    <div
      class="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
    >
      {emptyMessage}
    </div>
  {:else}
    {@render children?.({ expanded: isExpanded })}
  {/if}
{/snippet}

<section
  aria-labelledby="{uid}-title"
  aria-busy={loading ? 'true' : undefined}
  class="flex h-full min-h-0 min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-surface-foreground shadow-soft {className}"
>
  <header class="flex items-start justify-between gap-2">
    <div class="grid min-w-0 gap-0.5">
      <h3 id="{uid}-title" class="truncate font-heading text-sm font-semibold">{title}</h3>
      {#if description}<p class="truncate text-xs text-muted-foreground">{description}</p>{/if}
    </div>
    <div class="flex shrink-0 items-center gap-1">
      {#if expandable}
        <Button
          variant="ghost"
          size="icon"
          class="size-8 min-h-0 min-w-0"
          aria-label="Expand {title}"
          onclick={() => (expanded = true)}
        >
          <span aria-hidden="true">⤢</span>
        </Button>
      {/if}
      {#if menu.length > 0}
        <DropdownMenu items={menu}>
          {#snippet trigger({ props })}
            <Button {...props} variant="ghost" size="icon" class="size-8 min-h-0 min-w-0" aria-label="{title} options">
              <span aria-hidden="true">⋯</span>
            </Button>
          {/snippet}
        </DropdownMenu>
      {/if}
    </div>
  </header>
  <div class="flex min-h-0 flex-1 flex-col">
    {@render body(false)}
  </div>
</section>

{#if expandable}
  <Dialog bind:open={expanded} {title} {description} size="xl">
    <div class="flex min-h-[60vh] flex-col">
      {#if expanded}{@render body(true)}{/if}
    </div>
  </Dialog>
{/if}
