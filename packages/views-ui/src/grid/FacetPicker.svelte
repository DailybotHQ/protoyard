<script lang="ts" module>
import { Icon } from 'texuli/icons';
export interface FacetOption {
  value: string | number | boolean | null;
  label: string;
}
</script>

<script lang="ts" generics="T">
import { Check, ChevronDown } from '@lucide/svelte';
import { cx } from 'texuli/cx';
import { buttonVariants, Button, Input } from '@protoyard/ui';
import {
  compareScalars,
  type FilterNode,
  facetsFromFilter,
  type GridColumnDef,
  setFacet,
  toggleFacetValue,
} from '@protoyard/views/grid';
import { tick } from 'svelte';

/**
 * A keyboard-first multi-select for one column's values: the toolbar's
 * "Stage · 2" button opens a searchable listbox (arrows, Home/End, Enter or
 * Space to toggle, typing to search, Escape to close). Picks compose as a
 * facet: OR within this column, AND with every other condition. Controlled
 * through `onchange` with the next filter.
 */
let {
  column,
  value,
  onchange,
  options: given,
  class: className,
}: {
  column: GridColumnDef<T>;
  value: FilterNode | null;
  onchange: (next: FilterNode | null) => void;
  /** Values to offer (default: an enum column's options, or Yes/No for a boolean column). */
  options?: readonly FacetOption[];
  class?: string;
} = $props();

const uid = $props.id();
let open = $state(false);
let query = $state('');
let activeIndex = $state(0);
let root = $state<HTMLDivElement>();
let trigger = $state<HTMLElement>();
let search = $state<HTMLInputElement>();

const options = $derived<readonly FacetOption[]>(
  given ??
    (column.type === 'boolean'
      ? [
          { value: true, label: 'Yes' },
          { value: false, label: 'No' },
        ]
      : (column.options ?? []).map((option) => ({ value: option, label: option })))
);
const selected = $derived(facetsFromFilter(value).facets[column.key] ?? []);
const isSelected = (option: FacetOption) =>
  selected.some((entry) => compareScalars(entry, option.value) === 0);
const shown = $derived(
  query.trim() === ''
    ? options
    : options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))
);
const optionId = (index: number) => `facet-${uid}-${index}`;

async function show() {
  open = true;
  query = '';
  activeIndex = Math.max(0, options.findIndex(isSelected));
  await tick();
  search?.focus();
}

function hide(returnFocus = true) {
  open = false;
  if (returnFocus) trigger?.focus();
}

function toggle(option: FacetOption | undefined) {
  if (option) onchange(toggleFacetValue(value, column.key, option.value));
}

function scrollActive() {
  void tick().then(() =>
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' })
  );
}

function onKey(event: KeyboardEvent) {
  const last = shown.length - 1;
  const moves: Record<string, () => number> = {
    ArrowDown: () => Math.min(last, activeIndex + 1),
    ArrowUp: () => Math.max(0, activeIndex - 1),
    Home: () => 0,
    End: () => Math.max(0, last),
  };
  const move = moves[event.key];
  if (move) {
    event.preventDefault();
    activeIndex = move();
    scrollActive();
  } else if (event.key === 'Enter' || (event.key === ' ' && query === '')) {
    event.preventDefault();
    toggle(shown[activeIndex]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    hide();
  } else if (event.key === 'Tab') {
    hide(false);
  }
}

function onFocusOut(event: FocusEvent) {
  if (open && !root?.contains(event.relatedTarget as Node | null)) hide(false);
}
</script>

<div bind:this={root} class={cx('relative inline-block', className)} onfocusout={onFocusOut}>
  <Button
    bind:ref={trigger}
    type="button"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={open ? `facet-${uid}-list` : undefined}
    class={buttonVariants({ variant: selected.length ? 'secondary' : 'outline', size: 'sm' })}
    onclick={() => (open ? hide() : show())}
    onkeydown={(event) => {
      if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        void show();
      }
    }}
  >
    {column.header}{#if selected.length}<span class="tabular-nums">· {selected.length}</span><span class="sr-only"> selected</span>{/if}
    <Icon icon="chevron-down" class="size-4" aria-hidden="true"  />
  </Button>
  {#if open}
    <div class="absolute top-full left-0 z-30 mt-1 w-64 rounded-md border border-border bg-surface p-1 shadow-lg">
      <Input
        bind:ref={search}
        bind:value={query}
        role="combobox"
        aria-label={`Search ${column.header} values`}
        aria-expanded="true"
        aria-controls={`facet-${uid}-list`}
        aria-autocomplete="list"
        aria-activedescendant={shown.length ? optionId(activeIndex) : undefined}
        class="mb-1 h-8 w-full rounded border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Search"
        oninput={() => (activeIndex = 0)}
        onkeydown={onKey}
      />
      <ul id={`facet-${uid}-list`} role="listbox" aria-multiselectable="true" aria-label={column.header} class="max-h-60 overflow-auto">
        {#each shown as option, index (String(option.value))}
          <!-- Focus stays in the search field; options are picked by pointer or keyboard there. -->
          <li
            id={optionId(index)}
            role="option"
            aria-selected={isSelected(option)}
            class={cx('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm', index === activeIndex && 'bg-muted')}
            onpointerenter={() => (activeIndex = index)}
            onpointerdown={(event) => event.preventDefault()}
            onclick={() => toggle(option)}
            onkeydown={() => {}}
          >
            <span class={cx('flex size-4 items-center justify-center rounded border border-input', isSelected(option) && 'border-primary bg-primary text-primary-foreground')}>
              {#if isSelected(option)}<Icon icon="check" class="size-3" aria-hidden="true"  />{/if}
            </span>
            <span class="truncate">{option.label}</span>
          </li>
        {:else}
          <li class="px-2 py-1.5 text-sm text-muted-foreground" role="presentation">No matching values</li>
        {/each}
      </ul>
      {#if selected.length}
        <Button
          type="button"
          class="mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onclick={() => {
            onchange(setFacet(value, column.key, []));
            search?.focus();
          }}
        >Clear {column.header}</Button>
      {/if}
    </div>
  {/if}
</div>
