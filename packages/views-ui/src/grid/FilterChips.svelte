<script lang="ts" generics="T">
import { X } from '@lucide/svelte';
import { Button } from '@protoyard/ui';
import {
  type DescribeFilterOptions,
  describeFilter,
  type FilterNode,
  type GridColumnDef,
  removeFilterAt,
} from '@protoyard/views/grid';
import { tick } from 'svelte';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';

/**
 * The active filter as removable chips ("Stage is any of Lead or Won"), one
 * per top-level condition, with "Clear all". Controlled: every change goes
 * through `onchange` with the next filter (null when nothing is left).
 */
let {
  columns,
  value,
  onchange,
  formatValue,
  label = 'Active filters',
  class: className,
}: {
  columns: readonly GridColumnDef<T>[];
  value: FilterNode | null;
  onchange: (next: FilterNode | null) => void;
  formatValue?: DescribeFilterOptions['formatValue'];
  label?: string;
  class?: string;
} = $props();

let list = $state<HTMLUListElement>();
const chips = $derived(describeFilter(value, columns, formatValue ? { formatValue } : {}));

async function remove(index: number) {
  const chip = chips[index];
  if (!chip) return;
  onchange(removeFilterAt(value, chip.path));
  // Keep focus in the chip row: the chip that took this one's place, else the previous one.
  await tick();
  const buttons = list?.querySelectorAll<HTMLButtonElement>('[data-chip-remove]') ?? [];
  const next = buttons[Math.min(index, buttons.length - 1)];
  if (next) next.focus();
  else list?.focus();
}
</script>

{#if chips.length > 0}
  <ul bind:this={list} tabindex="-1" aria-label={label} class={cx('flex flex-wrap items-center gap-2 outline-none', className)}>
    {#each chips as chip, index (chip.id + chip.text)}
      <li class="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted py-0.5 pr-1 pl-3 text-sm">
        <span class="truncate">
          <span class="font-medium">{chip.label}</span>{#if chip.operator}{' '}<span class="text-muted-foreground">{chip.operator}</span>{/if}{#if chip.value}{' '}{chip.value}{/if}
        </span>
        <Button
          type="button"
          variant="ghost"
          data-chip-remove
          aria-label={`Remove filter: ${chip.text}`}
          class="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onclick={() => remove(index)}
        >
          <Icon icon="close" class="size-3.5" aria-hidden="true"  />
        </Button>
      </li>
    {/each}
    {#if chips.length > 1}
      <li><Button variant="ghost" size="sm" onclick={() => onchange(null)}>Clear all</Button></li>
    {/if}
  </ul>
{/if}
