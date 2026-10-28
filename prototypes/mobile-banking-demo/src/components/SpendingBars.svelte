<script lang="ts">
import { LucideIcon } from 'texuli/icons/lucide';
import type { CategorySpend } from '../lib/derive.ts';
import { CATEGORY_LABELS, formatMoney } from '../lib/format.ts';
import { CATEGORY_ICONS } from './icons.ts';

let { items }: { items: CategorySpend[] } = $props();
</script>

<ul class="flex flex-col gap-3">
  {#each items as item (item.category)}
    {@const Glyph = CATEGORY_ICONS[item.category]}
    <li class="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1">
      <LucideIcon icon={Glyph} class="row-span-2 size-4 text-muted-foreground" />
      <span class="text-sm">{CATEGORY_LABELS[item.category]}</span>
      <span class="text-sm font-medium tabular-nums">{formatMoney(item.cents)}</span>
      <span class="col-span-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span
          class="block h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-500"
          style:width={`${Math.max(4, Math.round(item.ratio * 100))}%`}
        ></span>
      </span>
    </li>
  {/each}
</ul>
