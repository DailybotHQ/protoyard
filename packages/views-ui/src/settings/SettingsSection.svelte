<script lang="ts">
import type { Snippet } from 'svelte';
import { cx } from 'texuli/cx';

interface Props {
  title: string;
  description?: string;
  /** Actions under the content (a save button for sections that save on their own). */
  footer?: Snippet;
  children: Snippet;
  class?: string;
}

let { title, description, footer, children, class: className }: Props = $props();
const uid = $props.id();
</script>

<section
  aria-labelledby={`settings-section-${uid}`}
  class={cx('rounded-xl border border-border bg-surface', className)}
>
  <header class="border-b border-border px-4 py-3 sm:px-6">
    <h3 id={`settings-section-${uid}`} class="text-sm font-semibold">{title}</h3>
    {#if description}<p class="mt-0.5 text-sm text-muted-foreground">{description}</p>{/if}
  </header>
  <div class="divide-y divide-border px-4 sm:px-6">{@render children()}</div>
  {#if footer}
    <footer class="flex justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">{@render footer()}</footer>
  {/if}
</section>
