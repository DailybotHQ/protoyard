<script lang="ts">
import { Info, TriangleAlert, WifiOff } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { Alert } from 'texuli/alert';
import { LucideIcon } from 'texuli/icons/lucide';

/**
 * Inline banner for conditions people must understand (offline, read-only access,
 * simulated failures). `tone` picks the design system's alert tone (AA contrast).
 */
let {
  tone = 'info',
  title,
  children,
  icon: glyph = 'info',
}: {
  tone?: 'info' | 'warning' | 'danger';
  title: string;
  children?: Snippet;
  icon?: 'info' | 'warning' | 'offline';
} = $props();

const Icon = $derived(glyph === 'offline' ? WifiOff : glyph === 'warning' ? TriangleAlert : Info);
const alertTone = $derived(tone === 'danger' ? 'error' : tone);
</script>

<Alert tone={alertTone} {title} role={tone === 'info' ? 'note' : 'status'} {children}>
  {#snippet icon()}<LucideIcon icon={Icon} class="size-4 shrink-0" />{/snippet}
</Alert>
