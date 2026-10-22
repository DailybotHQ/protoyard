<script lang="ts">
import { cn } from '../../lib/cn.ts';
import type { IconComponent } from '../../lib/types.ts';
import { STATUS_CHIP_TONE_CLASSES, type StatusChipTone } from './tones.ts';

/**
 * Status chip that always carries a word (never color alone). Tones map to
 * theme token pairs so small text stays readable.
 */
let {
  label,
  tone = 'neutral',
  icon: Icon,
  class: className,
}: {
  /** Required visible word — color is never the only signal. */
  label: string;
  tone?: StatusChipTone;
  icon?: IconComponent;
  class?: string;
} = $props();
</script>

<span
  class={cn(
    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
    STATUS_CHIP_TONE_CLASSES[tone],
    className
  )}
  data-py-status-chip
  data-tone={tone}
>
  {#if Icon}<Icon class="size-3.5 shrink-0" aria-hidden="true" />{/if}
  {label}
</span>
