<script lang="ts">
import type { TagsInputInvalidDetail } from '@texuli/primitives/tags-input';
import { cx } from 'texuli/cx';
import { labelClass } from 'texuli/field';
import { TagsInput } from 'texuli/tags-color';
import { isEmailAddress } from './email.ts';

/**
 * TagEmailInput — type addresses and commit with Enter, Space, comma or
 * semicolon; paste splits the same way; Backspace on an empty draft moves
 * to the last tag, and Backspace there removes it. Format-only email checks; set `ignoreValidation` for free
 * tags. Texuli's `TagsInput` (`texuli/tags-color`) owns the tags, the draft
 * and the remove buttons; this component adds the email rules, the
 * case-insensitive duplicate check and the inline error.
 */
interface Props {
  value?: string[];
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  /** Shrink to a single line (default is a taller invite box). */
  autosize?: boolean;
  /** Accept any non-empty token, not only email addresses. */
  ignoreValidation?: boolean;
  /** Return true to refuse a token after the built-in checks. */
  validationRules?: (text: string) => boolean;
  invalidMessage?: string;
  duplicateMessage?: string;
  disabled?: boolean;
  /** Read-only behaves as disabled: Texuli's TagsInput has no read-only state (gap N20). */
  readonly?: boolean;
  required?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-label'?: string;
  class?: string;
  onValueChange?: (value: string[]) => void;
  onDraftChange?: (text: string) => void;
  onDuplicate?: (text: string) => void;
}

let {
  value = $bindable([] as string[]),
  id,
  name,
  label = '',
  placeholder = 'name@example.com',
  autosize = false,
  ignoreValidation = false,
  validationRules,
  invalidMessage = 'Enter a valid email address',
  duplicateMessage = 'This address is already in the list',
  disabled = false,
  readonly = false,
  required = false,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  class: className,
  onValueChange,
  onDraftChange,
  onDuplicate,
}: Props = $props();

const uid = $props.id();
const fieldId = $derived(id ?? `tag-email-${uid}`);
const labelId = $derived(`${fieldId}-label`);
const errorId = $derived(`${fieldId}-error`);

let draft = $state('');
let localError = $state('');

const showError = $derived(Boolean(localError) || ariaInvalid === true || ariaInvalid === 'true');
const described = $derived(
  [describedBy, localError ? errorId : ''].filter(Boolean).join(' ') || undefined
);

/** Refuses with the message to show: a bad address, a caller rule, or a duplicate (any case). */
function validate(tag: string, tags: readonly string[]): boolean | string {
  if (validationRules?.(tag)) return invalidMessage;
  if (!ignoreValidation && !isEmailAddress(tag)) return invalidMessage;
  const lower = tag.toLowerCase();
  if (tags.some((entry) => entry.toLowerCase() === lower)) {
    onDuplicate?.(tag);
    return duplicateMessage;
  }
  return true;
}

function handleInvalid(detail: TagsInputInvalidDetail): void {
  localError =
    detail.message ?? (detail.reason === 'duplicate' ? duplicateMessage : invalidMessage);
  if (detail.reason === 'duplicate') onDuplicate?.(detail.tag);
}

function handleDraft(text: string): void {
  localError = '';
  onDraftChange?.(text);
}

/**
 * Space, comma and semicolon add the typed address like Enter. Texuli's
 * TagsInput takes one delimiter key (gap N21), so they become Enter here,
 * before the input sees them; the RegExp delimiter still splits pasted text.
 */
function handleKeydown(event: KeyboardEvent): void {
  if (![' ', ',', ';'].includes(event.key)) return;
  const field = event.target;
  if (!(field instanceof HTMLInputElement) || !field.matches('[data-tx-tags-field]')) return;
  event.preventDefault();
  event.stopPropagation();
  if (!field.value.trim()) return;
  field.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );
}

function handleValue(next: string[]): void {
  localError = '';
  onValueChange?.(next);
}
</script>

<div class={cx('grid gap-1.5', className)} onkeydowncapture={handleKeydown}>
  {#if label}
    <span id={labelId} class={labelClass()}>{label}</span>
  {/if}
  <TagsInput
    bind:value
    bind:inputValue={() => draft, (next) => (draft = next)}
    id={fieldId}
    {name}
    {required}
    disabled={disabled || readonly}
    delimiter={/[\s,;]+/}
    addOnBlur
    {validate}
    label={label ? `${label}: added` : 'Added tags'}
    inputLabel={ariaLabel ?? (label || 'Add an address')}
    placeholder={value.length ? '' : placeholder}
    onValueChange={handleValue}
    onInputValueChange={handleDraft}
    onInvalid={handleInvalid}
    aria-labelledby={label && !ariaLabel ? labelId : undefined}
    aria-describedby={described}
    aria-invalid={showError || undefined}
    inputmode="email"
    {...{ autocomplete: 'off' }}
    class={autosize ? undefined : 'min-h-[7.5rem] items-start'}
    data-invalid={showError || undefined}
  />
  {#if localError}
    <p id={errorId} class="text-xs text-destructive" role="alert">{localError}</p>
  {/if}
</div>
