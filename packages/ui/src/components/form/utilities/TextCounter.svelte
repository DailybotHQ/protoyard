<script lang="ts">
import type { HTMLInputAttributes, HTMLTextareaAttributes } from 'svelte/elements';
import { cn } from '../../../lib/cn.ts';
import { fieldClasses } from '../../input/input-classes.ts';

/**
 * TextCounter — input or textarea with a remaining-character countdown that
 * appears while focused once fewer than `showAfter` characters are left.
 */
type Props = {
  value?: string;
  tag?: 'input' | 'textarea';
  type?: HTMLInputAttributes['type'];
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  maxlength?: number;
  /** Show the countdown once this many characters (or fewer) remain. */
  showAfter?: number;
  rows?: number;
  disabled?: boolean;
  readonly?: boolean;
  required?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-label'?: string;
  class?: string;
  onValueChange?: (value: string) => void;
} & Omit<
  HTMLInputAttributes & HTMLTextareaAttributes,
  | 'value'
  | 'class'
  | 'id'
  | 'name'
  | 'placeholder'
  | 'maxlength'
  | 'disabled'
  | 'readonly'
  | 'required'
  | 'rows'
  | 'type'
  | 'oninput'
>;

let {
  value = $bindable(''),
  tag = 'input',
  type = 'text',
  id,
  name,
  label = '',
  placeholder = '',
  maxlength = 256,
  showAfter = 20,
  rows = 3,
  disabled = false,
  readonly = false,
  required = false,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  class: className,
  onValueChange,
  ...rest
}: Props = $props();

const uid = $props.id();
const fieldId = $derived(id ?? `text-counter-${uid}`);
const counterId = $derived(`${fieldId}-count`);

let focused = $state(false);

const remaining = $derived(maxlength - (value?.length ?? 0));
const showCount = $derived(focused && remaining <= showAfter);
const invalid = $derived(ariaInvalid === true || ariaInvalid === 'true');
const described = $derived(
  [describedBy, showCount ? counterId : ''].filter(Boolean).join(' ') || undefined
);

function handleInput(event: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) {
  const next = event.currentTarget.value.slice(0, maxlength);
  value = next;
  onValueChange?.(next);
}
</script>

<div class={cn('grid gap-1.5', className)}>
  {#if label}
    <label for={fieldId} class="text-sm font-medium text-foreground">{label}</label>
  {/if}
  <div class="relative">
    {#if tag === 'textarea'}
      <textarea
        id={fieldId}
        {name}
        {value}
        {placeholder}
        {disabled}
        {readonly}
        {maxlength}
        {rows}
        required={required || undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={described}
        class={cn(fieldClasses, 'min-h-[5rem] resize-y px-3 py-2 pr-12')}
        oninput={handleInput}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
        {...rest}
      ></textarea>
    {:else}
      <input
        id={fieldId}
        {name}
        {type}
        {value}
        {placeholder}
        {disabled}
        {readonly}
        {maxlength}
        required={required || undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={described}
        class={cn(fieldClasses, 'h-9 min-h-touch px-3 py-1 pr-12 sm:min-h-0')}
        oninput={handleInput}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
        {...rest}
      />
    {/if}
    <span
      id={counterId}
      class={cn(
        'pointer-events-none absolute text-xs text-muted-foreground tabular-nums',
        tag === 'textarea' ? 'right-3 bottom-2' : 'top-1/2 right-3 -translate-y-1/2',
        !showCount && 'sr-only'
      )}
      aria-live="polite"
    >
      {remaining}<span class="sr-only"> characters left</span>
    </span>
  </div>
</div>
