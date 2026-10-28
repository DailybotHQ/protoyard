<script lang="ts">
import { Info, TriangleAlert, WifiOff } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';

/**
 * Inline banner for conditions people must understand (offline, read-only access,
 * simulated failures). `tone` picks colors with AA contrast.
 */
let {
  tone = 'info',
  title,
  children,
  icon = 'info',
}: {
  tone?: 'info' | 'warning' | 'danger';
  title: string;
  children?: Snippet;
  icon?: 'info' | 'warning' | 'offline';
} = $props();

const Icon = $derived(icon === 'offline' ? WifiOff : icon === 'warning' ? TriangleAlert : Info);
const tones = {
  info: 'border-info/30 bg-info/10',
  warning: 'border-warning/40 bg-warning/15',
  danger: 'border-destructive/30 bg-destructive/10',
};
</script>

<div
  role={tone === 'info' ? 'note' : 'status'}
  class={['flex gap-3 rounded-xl border p-3 text-sm text-foreground', tones[tone]]}
>
  <LucideIcon icon={Icon} class="mt-0.5 size-4 shrink-0" />
  <div class="min-w-0">
    <p class="font-medium">{title}</p>
    {#if children}<div class="mt-0.5 text-muted-foreground">{@render children()}</div>{/if}
  </div>
</div>
