<script lang="ts">
/**
 * Single- or multi-select chip group. Single mode is a radiogroup with roving
 * tabindex; multi mode uses `aria-pressed` toggle buttons. Theme tokens only.
 */
import { cn } from '../lib/cn.ts';
import { type RovingEntry, rovingKeydown, rovingTabIndex } from '../lib/roving.ts';
import type { ChipOption } from './chip-group-types.ts';

interface Props {
  /** Options to render. */
  items: readonly ChipOption[];
  /**
   * Selected values. Single mode keeps at most one entry; multi keeps many.
   * Bind with `bind:value`.
   */
  value?: string[];
  /** `single` = radio semantics; `multi` = toggle many. */
  mode?: 'single' | 'multi';
  /** Accessible name for the group. */
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  class?: string;
  onchange?: (value: string[]) => void;
}

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
}: Props = $props();

const entries = $derived<RovingEntry[]>(
  items.map((item) => ({ value: item.value, disabled: disabled || item.disabled }))
);
const selected = $derived(new Set(value));
const currentSingle = $derived(mode === 'single' ? (value[0] ?? '') : '');

function emit(next: string[]): void {
  value = next;
  onchange?.(next);
}

function selectSingle(next: string): void {
  if (disabled) return;
  const item = items.find((entry) => entry.value === next);
  if (!item || item.disabled) return;
  emit([next]);
}

function toggleMulti(next: string): void {
  if (disabled) return;
  const item = items.find((entry) => entry.value === next);
  if (!item || item.disabled) return;
  if (selected.has(next)) {
    emit(value.filter((entry) => entry !== next));
  } else {
    emit([...value, next]);
  }
}

function onChipKeydown(event: KeyboardEvent, chipValue: string): void {
  if (disabled) return;
  if (mode === 'single') {
    rovingKeydown(event, entries, currentSingle || chipValue, selectSingle);
    return;
  }
  // Multi: arrows move focus without changing selection; Space/Enter toggle.
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    toggleMulti(chipValue);
    return;
  }
  const enabled = entries.filter((entry) => !entry.disabled);
  if (enabled.length === 0) return;
  let index = enabled.findIndex((entry) => entry.value === chipValue);
  if (index < 0) index = 0;
  let next = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    next = (index + 1) % enabled.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    next = (index - 1 + enabled.length) % enabled.length;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = enabled.length - 1;
  } else {
    return;
  }
  event.preventDefault();
  const target = enabled[next];
  if (!target) return;
  const group = (event.currentTarget as Element).closest('[data-chip-group]');
  const el = group?.querySelector<HTMLElement>(`[data-value]`);
  // Prefer exact match without CSS.escape issues.
  if (group) {
    for (const candidate of group.querySelectorAll<HTMLElement>('[data-value]')) {
      if (candidate.getAttribute('data-value') === target.value) {
        candidate.focus();
        break;
      }
    }
  } else {
    el?.focus();
  }
}

const sizeClass = $derived(
  size === 'sm'
    ? 'h-8 min-h-touch px-2.5 text-xs sm:min-h-0'
    : 'h-9 min-h-touch px-3 text-sm sm:min-h-0'
);
</script>

<div class={cn('grid gap-2', className)} data-chip-group="">
  <p class={cn('text-sm font-medium text-foreground', hideLabel && 'sr-only')}>{label}</p>
  <div
    role={mode === 'single' ? 'radiogroup' : 'group'}
    aria-label={label}
    class="flex flex-wrap gap-2"
  >
    {#each items as item (item.value)}
      {@const isOn = selected.has(item.value)}
      {@const itemDisabled = disabled || Boolean(item.disabled)}
      <button
        type="button"
        role={mode === 'single' ? 'radio' : undefined}
        aria-checked={mode === 'single' ? isOn : undefined}
        aria-pressed={mode === 'multi' ? isOn : undefined}
        data-value={item.value}
        disabled={itemDisabled}
        tabindex={mode === 'single'
          ? itemDisabled
            ? -1
            : rovingTabIndex(currentSingle, item.value, entries)
          : itemDisabled
            ? -1
            : 0}
        onclick={() => (mode === 'single' ? selectSingle(item.value) : toggleMulti(item.value))}
        onkeydown={(event) => onChipKeydown(event, item.value)}
        class={cn(
          'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-50',
          sizeClass,
          isOn
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-surface text-foreground hover:bg-muted'
        )}
      >
        {item.label}
      </button>
    {/each}
  </div>
</div>
