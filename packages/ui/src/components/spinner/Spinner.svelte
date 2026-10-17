<script lang="ts">
import { LoaderCircle } from '@lucide/svelte';
import { cn } from '../../lib/cn.ts';

interface Props {
  class?: string;
  /** When set, the spinner is announced; otherwise it is decorative. */
  label?: string;
  size?: number | string;
}

let { class: className, label, size }: Props = $props();
</script>

{#if label}
  <span role="status" class="inline-flex items-center">
    <LoaderCircle {size} aria-hidden="true" class={cn('size-4 motion-safe:animate-spin', className)} />
    <span class="sr-only">{label}</span>
  </span>
{:else}
  <LoaderCircle {size} aria-hidden="true" class={cn('size-4 motion-safe:animate-spin', className)} />
{/if}
