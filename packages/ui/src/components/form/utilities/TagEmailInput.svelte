<script lang="ts">
import { X } from '@lucide/svelte';
import { cn } from '../../../lib/cn.ts';
import { fieldClasses } from '../../input/input-classes.ts';
import { isEmailAddress, splitTagTokens } from './email.ts';

/**
 * TagEmailInput — type addresses and commit with Enter, Space, comma or
 * semicolon; paste splits the same way; Backspace on an empty draft removes
 * the last tag. Format-only email checks; set `ignoreValidation` for free tags.
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
const tagsLabel = $derived(label ? `${label}: added` : 'Added tags');

let input: HTMLInputElement | undefined = $state();
let draft = $state('');
let localError = $state('');

const showError = $derived(Boolean(localError) || ariaInvalid === true || ariaInvalid === 'true');
const described = $derived(
  [describedBy, localError ? `${fieldId}-error` : ''].filter(Boolean).join(' ') || undefined
);

function refused(text: string): boolean {
  if (validationRules?.(text)) return true;
  return !ignoreValidation && !isEmailAddress(text);
}

function commit(raw: string): boolean {
  if (readonly || disabled) return false;
  const parts = splitTagTokens(raw);
  if (!parts.length) return true;
  const next = [...value];
  const seen = new Set(next.map((entry) => entry.toLowerCase()));
  const rejected: string[] = [];
  for (const part of parts) {
    if (refused(part)) {
      rejected.push(part);
      localError = invalidMessage;
      continue;
    }
    if (seen.has(part.toLowerCase())) {
      rejected.push(part);
      localError = duplicateMessage;
      onDuplicate?.(part);
      continue;
    }
    seen.add(part.toLowerCase());
    next.push(part);
  }
  if (next.length !== value.length) {
    value = next;
    onValueChange?.(next);
  }
  draft = rejected.join(' ');
  if (!rejected.length) localError = '';
  return rejected.length === 0;
}

function remove(index: number) {
  if (readonly || disabled) return;
  const next = value.filter((_, i) => i !== index);
  value = next;
  onValueChange?.(next);
  input?.focus();
}

function onkeydown(event: KeyboardEvent) {
  if (['Enter', ' ', ',', ';'].includes(event.key)) {
    if (!draft.trim()) {
      if (event.key === 'Enter') return;
      event.preventDefault();
      return;
    }
    event.preventDefault();
    commit(draft);
  } else if (event.key === 'Backspace' && !draft && value.length) {
    remove(value.length - 1);
  }
}

function onpaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? '';
  if (/[,;\s\n]/.test(text.trim())) {
    event.preventDefault();
    commit(`${draft} ${text}`);
  }
}
</script>

<div class={cn('grid gap-1.5', className)}>
  {#if label}
    <label for={fieldId} class="text-sm font-medium text-foreground">{label}</label>
  {/if}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class={cn(
      fieldClasses,
      'flex min-h-touch cursor-text flex-wrap items-center gap-1 px-2 py-1.5 sm:min-h-0',
      autosize ? 'min-h-9' : 'min-h-[7.5rem] items-start',
      (disabled || readonly) && 'cursor-default'
    )}
    data-invalid={showError || undefined}
    aria-invalid={showError || undefined}
    onclick={() => input?.focus()}
  >
    <ul class="flex flex-wrap items-center gap-1" aria-label={tagsLabel}>
      {#each value as tag, index (tag)}
        <li
          class="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-sm text-foreground"
        >
          <span class="truncate">{tag}</span>
          {#if !readonly && !disabled}
            <button
              type="button"
              class="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:size-5"
              aria-label={`Remove ${tag}`}
              onclick={(event) => {
                event.stopPropagation();
                remove(index);
              }}
            >
              <X class="size-3.5" aria-hidden="true" />
            </button>
          {/if}
        </li>
      {/each}
      <li class="min-w-[8rem] flex-1">
        <input
          bind:this={input}
          bind:value={draft}
          id={fieldId}
          {name}
          type="text"
          inputmode="email"
          autocomplete="off"
          placeholder={value.length ? '' : placeholder}
          {readonly}
          {disabled}
          required={required && value.length === 0}
          aria-invalid={showError || undefined}
          aria-describedby={described}
          aria-label={ariaLabel ?? (label || undefined)}
          class="h-9 w-full min-w-0 border-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:h-8 sm:text-sm"
          oninput={() => {
            localError = '';
            onDraftChange?.(draft);
          }}
          {onkeydown}
          {onpaste}
          onblur={() => draft.trim() && commit(draft)}
        />
      </li>
    </ul>
  </div>
  {#if localError}
    <p id={`${fieldId}-error`} class="text-xs text-destructive" role="alert">{localError}</p>
  {/if}
</div>
