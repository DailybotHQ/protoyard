<script lang="ts">
import { createFormBridge, type FormBridge } from '@texuli/core/form-bridge';
import { tick, untrack } from 'svelte';
import type { HTMLButtonAttributes } from 'svelte/elements';
import { Button } from 'texuli/button';
import { cx } from 'texuli/cx';
import { labelClass } from 'texuli/field';
import { Icon } from 'texuli/icons';
import { popoverContentClass } from 'texuli/popover';
import { composeHandlers } from '../../../lib/handlers.ts';
import Input from '../../input/Input.svelte';
import { EMOJI_GROUPS } from './emojis.ts';

/**
 * EmojiPicker — choose one emoji from a searchable, grouped grid. Arrow keys
 * move in the grid; Enter picks; Escape closes. No network, no skin-tone API.
 * Texuli has no emoji picker, so this composes Texuli's Button, Input, Icon
 * and popover surface around Protoyard's emoji data.
 */
interface OwnProps {
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
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
}

/**
 * Extra attributes (`data-*`, handlers…) land on the trigger button, the
 * focusable control inside the root. A caller `onclick` runs first; calling
 * `preventDefault()` in it keeps the picker from opening or closing.
 */
type Props = OwnProps &
  Omit<HTMLButtonAttributes, keyof OwnProps | 'children' | 'type' | 'form' | 'formaction'>;

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
  ref = $bindable(null),
  onclick: callerClick,
  ...rest
}: Props = $props();

// A plain record keeps the spread onto Texuli's Button a finite type.
const forwarded = $derived(rest as Record<string, unknown>);

const uid = $props.id();
const fieldId = $derived(id ?? `emoji-${uid}`);
const COLUMNS = 8;

let open = $state(false);
let query = $state('');
let focusIndex = $state(0);
let root: HTMLDivElement | undefined = $state();
let trigger: HTMLElement | null = $state(null);
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

/** The caller's click runs first; its `preventDefault()` keeps the picker as it is. */
const onTriggerClick = $derived(
  composeHandlers<MouseEvent>(
    callerClick as ((event: MouseEvent) => unknown) | null | undefined,
    toggle
  )
);

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

// With a `name` (or `required`), Texuli's form bridge (`@texuli/core/form-bridge`)
// submits the emoji and takes part in validation, focusing the trigger when invalid.
let bridge: FormBridge | null = null;
$effect(() => {
  if (!(name || required) || !root || !trigger) return;
  const created = createFormBridge(root.ownerDocument, {
    name: name ?? '',
    value: untrack(() => value),
    required,
    disabled,
    focusTarget: trigger,
  });
  root.prepend(created.input);
  bridge = created;
  return () => {
    created.dispose();
    bridge = null;
  };
});
$effect(() => {
  bridge?.setValue(value ?? '');
});

$effect(() => {
  if (!open) return;
  const outside = (event: PointerEvent) => {
    if (root && !root.contains(event.target as Node)) open = false;
  };
  window.addEventListener('pointerdown', outside);
  return () => window.removeEventListener('pointerdown', outside);
});
</script>

<div bind:this={ref} class={cx('ui-emoji-picker', className)}>
  {#if label}
    <span class={labelClass()} id={`${fieldId}-label`}>{label}</span>
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div bind:this={root} class="ui-emoji-picker__anchor" onkeydown={onRootKey}>
    <Button
      {...forwarded}
      bind:ref={trigger}
      variant="outline"
      id={fieldId}
      class={cx('ui-emoji-picker__trigger', invalid && 'ui-emoji-picker__trigger--invalid')}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={`${fieldId}-picker`}
      aria-labelledby={rest['aria-labelledby'] ?? (label ? `${fieldId}-label` : undefined)}
      aria-label={ariaLabel ?? (label || placeholder)}
      aria-describedby={describedBy}
      data-invalid={invalid || undefined}
      disabled={disabled || undefined}
      aria-disabled={readonly || undefined}
      onclick={onTriggerClick}
    >
      {#if value}
        <span class="ui-emoji-picker__value" aria-hidden="true">{value}</span>
        <span class="tx-sr-only">{value}</span>
      {:else}
        <span class="ui-emoji-picker__placeholder">{placeholder}</span>
      {/if}
      <Icon icon="chevron-down" size="sm" class={open ? 'ui-emoji-picker__chevron--open' : undefined} aria-hidden="true" />
    </Button>
    {#if open}
      <div
        id={`${fieldId}-picker`}
        class={popoverContentClass({ class: 'ui-emoji-picker__panel' })}
        role="dialog"
        aria-label={label || placeholder}
      >
        <Input
          data-emoji-search
          type="search"
          bind:value={query}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          autocomplete="off"
          onkeydown={(event: KeyboardEvent) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              void moveTo(0);
            }
          }}
        />
        <div
          bind:this={grid}
          class="ui-emoji-picker__grid"
          role="grid"
          aria-label="Emoji"
          tabindex="-1"
          onkeydown={onGridKey}
        >
          {#each groups as group (group.id)}
            <div class="ui-emoji-picker__group" role="presentation">{group.label}</div>
            <div class="ui-emoji-picker__row" role="row">
              {#each group.emojis as [emoji, emojiName] (emoji)}
                {@const index = flat.findIndex(([entry]) => entry === emoji)}
                <span role="gridcell">
                  <Button
                    variant="ghost"
                    size="icon"
                    class="ui-emoji-picker__emoji"
                    data-index={index}
                    tabindex={index === focusIndex ? 0 : -1}
                    aria-label={emojiName}
                    aria-pressed={emoji === value}
                    onclick={() => pick(emoji)}
                  >
                    {emoji}
                  </Button>
                </span>
              {/each}
            </div>
          {:else}
            <p class="ui-emoji-picker__empty">No emoji matches</p>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .ui-emoji-picker {
    display: grid;
    gap: 0.375rem;
  }
  .ui-emoji-picker__anchor {
    position: relative;
    inline-size: fit-content;
  }
  :global(.ui-emoji-picker__trigger) {
    inline-size: 7.5rem;
    justify-content: space-between;
  }
  :global(.ui-emoji-picker__trigger--invalid) {
    border-color: var(--tx-destructive, crimson);
  }
  :global(.ui-emoji-picker__chevron--open) {
    rotate: 180deg;
  }
  .ui-emoji-picker__value {
    font-size: 1.25rem;
    line-height: 1;
  }
  .ui-emoji-picker__placeholder {
    overflow: hidden;
    color: var(--tx-muted-foreground, GrayText);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.ui-emoji-picker__panel) {
    position: absolute;
    inset-block-start: calc(100% + 0.5rem);
    inset-inline-start: 0;
    z-index: 30;
    inline-size: min(20rem, calc(100vw - 2rem));
  }
  .ui-emoji-picker__grid {
    max-block-size: 16rem;
    margin-block-start: 0.5rem;
    overflow-y: auto;
    outline: none;
  }
  .ui-emoji-picker__group {
    padding: 0.5rem 0.125rem 0.25rem;
    color: var(--tx-muted-foreground, GrayText);
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .ui-emoji-picker__row {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 0.125rem;
  }
  :global(.ui-emoji-picker__emoji) {
    font-size: 1.25rem;
  }
  :global(.ui-emoji-picker__emoji[aria-pressed='true']) {
    background: var(--tx-muted, Canvas);
  }
  .ui-emoji-picker__empty {
    padding-block: 1rem;
    color: var(--tx-muted-foreground, GrayText);
    font-size: var(--tx-font-size-sm, 0.875rem);
    text-align: center;
  }
</style>
