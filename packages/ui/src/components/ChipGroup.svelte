<script lang="ts">
/**
 * Single- or multi-select chip group: a thin adapter over Texuli's
 * `ToggleGroup` (`texuli/toggle`). Both modes are `aria-pressed` toggle
 * buttons in one labelled group with a single tab stop; arrows move between
 * chips. The value is always a list (at most one entry in single mode).
 */
import type { HTMLAttributes } from 'svelte/elements';
import { cx } from 'texuli/cx';
import { labelClass } from 'texuli/field';
import { ToggleGroup, ToggleGroupItem } from 'texuli/toggle';
import type { ChipOption } from './chip-group-types.ts';

interface OwnProps {
  /** Options to render. */
  items: readonly ChipOption[];
  /**
   * Selected values. Single mode keeps at most one entry; multi keeps many.
   * Bind with `bind:value`.
   */
  value?: string[];
  /** `single` = pick one; `multi` = toggle many. */
  mode?: 'single' | 'multi';
  /** Accessible name for the group. */
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  class?: string;
  onchange?: (value: string[]) => void;
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
}

/**
 * Extra attributes (`aria-*`, `data-*`, handlers…) land on the toggle group,
 * the labelled control inside the root. A caller `aria-label` or
 * `aria-labelledby` replaces the visible label as the group's name.
 */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps | 'role' | 'children'>;

let {
  items,
  value = $bindable<string[]>([]),
  mode = 'single',
  label,
  hideLabel = false,
  disabled = false,
  size = 'md',
  class: className,
  onchange,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const uid = $props.id();
const labelId = `chip-group-label-${uid}`;

// A plain record keeps the spread onto Texuli's ToggleGroup a finite type.
const forwarded = $derived(rest as Record<string, unknown>);
const groupLabelledby = $derived(
  rest['aria-labelledby'] ?? (rest['aria-label'] === undefined ? labelId : undefined)
);

function commit(next: string[]): void {
  value = next;
  onchange?.(next);
}
</script>

<div bind:this={ref} class={cx('ui-chip-group', className)}>
  <span id={labelId} class={labelClass({ class: hideLabel ? 'tx-sr-only' : undefined })}>{label}</span>
  {#if mode === 'single'}
    <ToggleGroup
      {...forwarded}
      type="single"
      value={value[0] ?? ''}
      onValueChange={(next: string | string[]) => commit(typeof next === 'string' && next ? [next] : [])}
      {disabled}
      {size}
      wrap
      aria-labelledby={groupLabelledby}
    >
      {#each items as item (item.value)}
        <ToggleGroupItem value={item.value} disabled={item.disabled}>{item.label}</ToggleGroupItem>
      {/each}
    </ToggleGroup>
  {:else}
    <ToggleGroup
      {...forwarded}
      type="multiple"
      {value}
      onValueChange={(next: string | string[]) => commit(Array.isArray(next) ? next : [])}
      {disabled}
      {size}
      wrap
      aria-labelledby={groupLabelledby}
    >
      {#each items as item (item.value)}
        <ToggleGroupItem value={item.value} disabled={item.disabled}>{item.label}</ToggleGroupItem>
      {/each}
    </ToggleGroup>
  {/if}
</div>

<style>
  .ui-chip-group {
    display: grid;
    gap: 0.5rem;
  }
</style>
