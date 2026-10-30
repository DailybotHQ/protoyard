<script lang="ts">
import type { HTMLInputAttributes } from 'svelte/elements';
import { labelClass } from 'texuli/field';
import { PinInput } from 'texuli/number-pin';

/**
 * OtpInput — fixed-length one-time-code entry: a thin adapter over Texuli's
 * `PinInput` (`texuli/number-pin`). One real input (one-time-code autofill,
 * paste, backspace and arrows) drawn as cells. Simulation UX only: it never
 * sends SMS, verifies codes or authenticates anyone. Wire `onComplete` to a
 * prototype service that decides what the filled code means.
 */
interface OwnProps {
  /** Bound code string (digits or allowed characters only). */
  value?: string;
  /** Accessible label of the code field. */
  label: string;
  /** Number of cells (2–12). Default 6. */
  length?: number;
  /** Characters accepted. Default digits only; letters are upper-cased. */
  pattern?: 'digits' | 'alphanumeric';
  disabled?: boolean;
  /** Focus the field on mount. */
  autofocus?: boolean;
  id?: string;
  name?: string;
  class?: string;
  /** Fires once when the code first becomes complete (exact-once per fill). */
  onComplete?: (code: string) => void;
  onValueChange?: (code: string) => void;
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
}

/**
 * Extra attributes (`aria-*`, `data-*`, `autocomplete`, handlers…) reach the
 * one real input inside the root, as with Texuli's PinInput.
 */
type Props = OwnProps &
  Omit<HTMLInputAttributes, keyof OwnProps | 'children' | 'maxlength' | 'type' | 'size'>;

let {
  value = $bindable(''),
  label,
  length = 6,
  pattern = 'digits',
  disabled = false,
  autofocus = true,
  id,
  name,
  class: className,
  onComplete,
  onValueChange,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const uid = $props.id();
const fieldId = $derived(id ?? `otp-${uid}`);
const cellCount = $derived(Math.min(12, Math.max(2, Math.floor(length) || 6)));
let input = $state<HTMLInputElement | null>(null);
const regexp = $derived(pattern === 'alphanumeric' ? '^[a-zA-Z0-9]+$' : '^\\d+$');

/** Last code that already fired onComplete, so a full code fires it once. */
let completedFor = $state<string | null>(null);

/** A pasted code keeps only the characters the pattern allows ("98-76 54" → "987654"). */
function cleanPaste(text: string): string {
  return pattern === 'alphanumeric' ? text.replace(/[^a-zA-Z0-9]/g, '') : text.replace(/\D/g, '');
}

function setValue(next: string): void {
  const code = pattern === 'alphanumeric' ? next.toUpperCase() : next;
  if (code === value) return;
  value = code;
  onValueChange?.(code);
  if (code.length < cellCount) {
    completedFor = null;
  } else if (completedFor !== code) {
    completedFor = code;
    onComplete?.(code);
  }
}

// Focus the real input once, when it first mounts.
let focused = false;
$effect(() => {
  if (focused || !input) return;
  focused = true;
  if (autofocus && !disabled) input.focus();
});
</script>

<div bind:this={ref} class={className} data-py-otp="">
  <label for={fieldId} class={labelClass()}>{label}</label>
  <PinInput.Root
    {...rest}
    bind:value={() => value, setValue}
    inputId={fieldId}
    maxlength={cellCount}
    pattern={regexp}
    pasteTransformer={cleanPaste}
    {disabled}
    {name}
    bind:inputRef={input}
  >
    {#snippet children({ cells })}
      {#each cells as cell, index (index)}
        <PinInput.Cell {cell} />
      {/each}
    {/snippet}
  </PinInput.Root>
</div>
