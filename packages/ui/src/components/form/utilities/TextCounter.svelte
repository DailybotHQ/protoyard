<script lang="ts">
import type { HTMLInputAttributes, HTMLTextareaAttributes } from 'svelte/elements';
import { TextCounter as TexuliTextCounter } from 'texuli/input';

/**
 * TextCounter — input or textarea with a remaining-character countdown that
 * appears while focused once fewer than `showAfter` characters are left.
 * Texuli's `TextCounter` (`texuli/input`): extra attributes reach the input
 * or textarea (`aria-*`, `data-*`, handlers) or the wrapper (the rest);
 * `ref` binds the wrapper root.
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
  /** The rendered root element, the wrapper (bindable). */
  ref?: HTMLElement | null;
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
  ref = $bindable(null),
  ...rest
}: Props = $props();

// A plain record keeps the spread onto Texuli's TextCounter a finite type.
const forwarded = $derived(rest as Record<string, unknown>);
</script>

<TexuliTextCounter
  bind:ref
  bind:value
  {tag}
  {type}
  {id}
  {name}
  {label}
  {placeholder}
  {maxlength}
  {showAfter}
  {rows}
  {disabled}
  {readonly}
  {required}
  invalid={ariaInvalid === true || ariaInvalid === 'true'}
  aria-describedby={describedBy}
  aria-label={ariaLabel}
  class={className}
  {onValueChange}
  {...forwarded}
/>
