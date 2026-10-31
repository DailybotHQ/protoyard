<script lang="ts">
import Filter from '@lucide/svelte/icons/filter';
import type { HTMLAttributes } from 'svelte/elements';
import { Tag } from 'texuli/badge';
import { Button } from 'texuli/button';
import { Checkbox } from 'texuli/choice';
import { cx } from 'texuli/cx';
import { LucideIcon } from 'texuli/icons/lucide';
import Input from '../input/Input.svelte';
import Popover from '../popover/Popover.svelte';
import Select from '../select/Select.svelte';
import {
  buildFilterChips,
  clearFilterChip,
  hasActiveFilters,
  isFilterActive,
  resetFilterValues,
  setListFilterValue,
} from './apply-filters.ts';
import type { DateRangeFilterValue, FilterField, FilterValue, FilterValues } from './types.ts';

interface OwnProps {
  /** The filter bar's root element (bindable). */
  ref?: HTMLElement | null;
  /** Column filter definitions (enum, date-range, boolean, relation). */
  fields: FilterField[];
  /** Active values keyed by field id — plain data safe for the hash query. */
  values?: FilterValues;
  onValuesChange?: (values: FilterValues) => void;
  /** Accessible name for the filter region. */
  label?: string;
  resetLabel?: string;
  class?: string;
}

/** Extra attributes (`data-*`, `aria-*`, `id`, handlers…) land on the root `role="search"` element. */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps>;

let {
  fields,
  values = $bindable({}),
  onValuesChange,
  label = 'Filters',
  resetLabel = 'Reset filters',
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const chips = $derived(buildFilterChips(fields, values));
const active = $derived(hasActiveFilters(fields, values));

const ANY = '__any__';

function commit(next: FilterValues): void {
  values = next;
  onValuesChange?.(next);
}

function setField(fieldId: string, value: FilterValue | null): void {
  commit({ ...values, [fieldId]: value });
}

function removeChip(fieldId: string, chipValue?: string): void {
  commit(clearFilterChip(fields, values, { fieldId, value: chipValue }));
}

function resetAll(): void {
  commit(resetFilterValues(fields));
}

function booleanSelectValue(fieldId: string): string {
  const v = values[fieldId];
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return ANY;
}

function onBooleanChange(fieldId: string, raw: string): void {
  if (raw === ANY || raw === '') {
    setField(fieldId, null);
    return;
  }
  setField(fieldId, raw === 'true');
}

function singleListValue(fieldId: string): string {
  const v = values[fieldId];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v[0]) return v[0];
  return ANY;
}

function onSingleListChange(fieldId: string, raw: string): void {
  if (raw === ANY || raw === '') {
    setField(fieldId, null);
    return;
  }
  setField(fieldId, raw);
}

function listChecked(fieldId: string, optionValue: string): boolean {
  const v = values[fieldId];
  if (typeof v === 'string') return v === optionValue;
  if (Array.isArray(v)) return v.includes(optionValue);
  return false;
}

function onListCheck(field: FilterField, optionValue: string, checked: boolean): void {
  const next = setListFilterValue(field, values[field.id], optionValue, checked);
  setField(field.id, next);
}

function dateRange(fieldId: string): DateRangeFilterValue {
  const v = values[fieldId];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return { from: v.from ?? '', to: v.to ?? '' };
  }
  return { from: '', to: '' };
}

function onDatePart(fieldId: string, part: 'from' | 'to', raw: string): void {
  const current = dateRange(fieldId);
  const next: DateRangeFilterValue = {
    from: part === 'from' ? raw || undefined : current.from || undefined,
    to: part === 'to' ? raw || undefined : current.to || undefined,
  };
  if (!next.from && !next.to) {
    setField(fieldId, null);
    return;
  }
  setField(fieldId, next);
}

function multiSummary(field: FilterField): string {
  if (field.kind !== 'enum' && field.kind !== 'relation') return field.label;
  const v = values[field.id];
  const selected = typeof v === 'string' ? (v ? [v] : []) : Array.isArray(v) ? v : [];
  if (selected.length === 0) return field.label;
  if (selected.length === 1) {
    const opt = field.options.find((o) => o.value === selected[0]);
    return `${field.label}: ${opt?.label ?? selected[0]}`;
  }
  return `${field.label}: ${selected.length} selected`;
}

function controlActive(field: FilterField): boolean {
  return isFilterActive(field, values[field.id]);
}
</script>

<!--
  Protoyard's filter model (apply-filters.ts) on Texuli controls: Select,
  Popover, Checkbox, Input, Button and removable Tag chips.
-->
<div
  {...rest}
  bind:this={ref}
  class={cx('flex flex-col gap-2', className)}
  role="search"
  aria-label={label}
  data-filter-bar
>
  <div class="flex flex-wrap items-center gap-2">
    <span class="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <LucideIcon icon={Filter} size="xs" />
      {label}
    </span>

    {#each fields as field (field.id)}
      {#if field.kind === 'boolean'}
        <Select
          items={[
            { value: ANY, label: 'Any' },
            { value: 'true', label: field.trueLabel ?? 'Yes' },
            { value: 'false', label: field.falseLabel ?? 'No' },
          ]}
          value={booleanSelectValue(field.id)}
          onValueChange={(v) => onBooleanChange(field.id, v)}
          placeholder={field.label}
          aria-label={field.label}
          class={cx('w-auto min-w-36', controlActive(field) && 'ui-filter--active')}
        />
      {:else if (field.kind === 'enum' || field.kind === 'relation') && !field.multiple}
        <Select
          items={[
            { value: ANY, label: 'Any' },
            ...field.options.map((o) => ({ value: o.value, label: o.label })),
          ]}
          value={singleListValue(field.id)}
          onValueChange={(v) => onSingleListChange(field.id, v)}
          placeholder={field.label}
          aria-label={field.label}
          class={cx('w-auto min-w-36', controlActive(field) && 'ui-filter--active')}
        />
      {:else if field.kind === 'enum' || field.kind === 'relation'}
        <Popover
          side="bottom"
          align="start"
          class="w-64 p-2"
        >
          {#snippet trigger({ props })}
            <Button
              variant="outline"
              class={cx('max-w-56 justify-between gap-2 font-normal', controlActive(field) && 'ui-filter--active')}
              aria-label={field.label}
              {...props}
            >
              <span class="truncate">{multiSummary(field)}</span>
            </Button>
          {/snippet}
          <div class="grid gap-1" role="group" aria-label={field.label}>
            {#each field.options as option (option.value)}
              <Checkbox
                label={option.label}
                checked={listChecked(field.id, option.value)}
                onCheckedChange={(checked) => onListCheck(field, option.value, checked)}
              />
            {/each}
          </div>
        </Popover>
      {:else if field.kind === 'date-range'}
        <Popover side="bottom" align="start" class="w-72 space-y-3 p-3">
          {#snippet trigger({ props })}
            <Button
              variant="outline"
              class={cx('max-w-56 justify-between gap-2 font-normal', controlActive(field) && 'ui-filter--active')}
              aria-label={field.label}
              {...props}
            >
              <span class="truncate">
                {#if controlActive(field)}
                  {@const range = dateRange(field.id)}
                  {field.label}:
                  {range.from || '…'}
                  →
                  {range.to || '…'}
                {:else}
                  {field.label}
                {/if}
              </span>
            </Button>
          {/snippet}
          <div class="grid gap-2">
            <label class="grid gap-1 text-xs font-medium text-foreground">
              From
              <Input
                type="date"
                value={dateRange(field.id).from ?? ''}
                aria-label={`${field.label} from`}
                oninput={(e) =>
                  onDatePart(field.id, 'from', (e.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <label class="grid gap-1 text-xs font-medium text-foreground">
              To
              <Input
                type="date"
                value={dateRange(field.id).to ?? ''}
                aria-label={`${field.label} to`}
                oninput={(e) =>
                  onDatePart(field.id, 'to', (e.currentTarget as HTMLInputElement).value)}
              />
            </label>
          </div>
        </Popover>
      {/if}
    {/each}

    {#if active}
      <Button variant="ghost" size="sm" onclick={resetAll}>{resetLabel}</Button>
    {/if}
  </div>

  {#if chips.length > 0}
    <ul class="flex flex-wrap gap-1.5" aria-label="Active filters">
      {#each chips as chip (chip.key)}
        <li>
          <Tag
            label={chip.label}
            removeLabel={(label) => `Remove filter: ${label}`}
            onRemove={() => removeChip(chip.fieldId, chip.value)}
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* An active filter control: the primary border, on Texuli's tokens. */
  :global(.ui-filter--active) {
    border-color: var(--tx-primary, Highlight);
    color: var(--tx-foreground, CanvasText);
  }
</style>
