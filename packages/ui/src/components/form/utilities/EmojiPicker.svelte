<script lang="ts">
import { ChevronDown, ChevronUp } from '@lucide/svelte';
import { tick } from 'svelte';
import { cn } from '../../../lib/cn.ts';
import { fieldClasses } from '../../input/input-classes.ts';
import { EMOJI_GROUPS } from './emojis.ts';

/**
 * EmojiPicker — choose one emoji from a searchable, grouped grid. Arrow keys
 * move in the grid; Enter picks; Escape closes. No network, no skin-tone API.
 */
interface Props {
  value?: string;
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  required?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-label'?: string;
  class?: string;
  onValueChange?: (emoji: string) => void;
}

let {
  value = $bindable(''),
  id,
  name,
  label = '',
  placeholder = 'Choose an emoji',
  searchPlaceholder = 'Search emoji',
  disabled = false,
  readonly = false,
  required = false,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  class: className,
  onValueChange,
}: Props = $props();

const uid = $props.id();
const fieldId = $derived(id ?? `emoji-${uid}`);
const COLUMNS = 8;

let open = $state(false);
let query = $state('');
let focusIndex = $state(0);
let root: HTMLDivElement | undefined = $state();
let trigger: HTMLButtonElement | undefined = $state();
let grid: HTMLDivElement | undefined = $state();

const groups = $derived.by(() => {
  const q = query.trim().toLowerCase();
  return EMOJI_GROUPS.map((group) => ({
    ...group,
    emojis: q ? group.emojis.filter(([, name]) => name.includes(q)) : group.emojis,
  })).filter((group) => group.emojis.length > 0);
});
const flat = $derived(groups.flatMap((group) => group.emojis));
const invalid = $derived(ariaInvalid === true || ariaInvalid === 'true');

async function toggle() {
  if (disabled || readonly) return;
  open = !open;
  if (open) {
    query = '';
    focusIndex = Math.max(
      0,
      flat.findIndex(([emoji]) => emoji === value)
    );
    await tick();
    root?.querySelector<HTMLInputElement>('[data-emoji-search]')?.focus();
  }
}

function pick(emoji: string) {
  value = emoji;
  open = false;
  trigger?.focus();
  onValueChange?.(emoji);
}

async function moveTo(index: number) {
  focusIndex = Math.max(0, Math.min(flat.length - 1, index));
  await tick();
  grid?.querySelector<HTMLElement>(`[data-index="${focusIndex}"]`)?.focus();
}

function onGridKey(event: KeyboardEvent) {
  const deltas: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -COLUMNS,
    ArrowDown: COLUMNS,
  };
  const delta = deltas[event.key];
  if (delta !== undefined) {
    event.preventDefault();
    void moveTo(focusIndex + delta);
  } else if (event.key === 'Home') {
    event.preventDefault();
    void moveTo(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    void moveTo(flat.length - 1);
  } else if (event.key === 'Enter' || event.key === ' ') {
    const entry = flat[focusIndex];
    if (entry) {
      event.preventDefault();
      pick(entry[0]);
    }
  }
}

function onRootKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && open) {
    event.preventDefault();
    open = false;
    trigger?.focus();
  }
}

$effect(() => {
  if (!open) return;
  const outside = (event: PointerEvent) => {
    if (root && !root.contains(event.target as Node)) open = false;
  };
  window.addEventListener('pointerdown', outside);
  return () => window.removeEventListener('pointerdown', outside);
});
</script>

<div class={cn('grid gap-1.5', className)}>
  {#if label}
    <span class="text-sm font-medium text-foreground" id={`${fieldId}-label`}>{label}</span>
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div bind:this={root} class="relative w-fit" onkeydown={onRootKey}>
    {#if name || required}
      <input type="hidden" {name} value={value} required={required || undefined} />
    {/if}
    <button
      bind:this={trigger}
      type="button"
      id={fieldId}
      class={cn(
        fieldClasses,
        'inline-flex h-9 min-h-touch w-[7.5rem] items-center justify-between gap-2 px-3 sm:min-h-0',
        invalid && 'border-destructive'
      )}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={`${fieldId}-picker`}
      aria-labelledby={label ? `${fieldId}-label` : undefined}
      aria-label={ariaLabel ?? (label || placeholder)}
      aria-describedby={describedBy}
      data-invalid={invalid || undefined}
      disabled={disabled || undefined}
      aria-disabled={readonly || undefined}
      onclick={toggle}
    >
      {#if value}
        <span class="text-xl leading-none" aria-hidden="true">{value}</span>
        <span class="sr-only">{value}</span>
      {:else}
        <span class="truncate text-muted-foreground">{placeholder}</span>
      {/if}
      {#if open}
        <ChevronUp class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {:else}
        <ChevronDown class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {/if}
    </button>
    {#if open}
      <div
        id={`${fieldId}-picker`}
        class="absolute top-[calc(100%+0.5rem)] left-0 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface p-3 shadow-lg"
        role="dialog"
        aria-label={label || placeholder}
      >
        <input
          data-emoji-search
          class={cn(fieldClasses, 'h-9 min-h-touch px-3 sm:min-h-0')}
          type="search"
          bind:value={query}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          autocomplete="off"
          onkeydown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              void moveTo(0);
            }
          }}
        />
        <div
          bind:this={grid}
          class="mt-2 max-h-64 overflow-y-auto outline-none"
          role="grid"
          aria-label="Emoji"
          tabindex="-1"
          onkeydown={onGridKey}
        >
          {#each groups as group (group.id)}
            <div
              class="px-0.5 pt-2 pb-1 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase"
              role="presentation"
            >
              {group.label}
            </div>
            <div class="grid grid-cols-8 gap-0.5" role="row">
              {#each group.emojis as [emoji, emojiName] (emoji)}
                {@const index = flat.findIndex(([entry]) => entry === emoji)}
                <span role="gridcell">
                  <button
                    type="button"
                    class={cn(
                      'flex size-9 items-center justify-center rounded-md text-xl hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:size-8',
                      emoji === value && 'bg-muted'
                    )}
                    data-index={index}
                    tabindex={index === focusIndex ? 0 : -1}
                    aria-label={emojiName}
                    aria-pressed={emoji === value}
                    onclick={() => pick(emoji)}
                  >
                    {emoji}
                  </button>
                </span>
              {/each}
            </div>
          {:else}
            <p class="py-4 text-center text-sm text-muted-foreground">No emoji matches</p>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
