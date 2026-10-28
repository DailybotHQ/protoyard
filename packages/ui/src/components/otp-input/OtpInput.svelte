<script lang="ts">
import { onMount } from 'svelte';
import { labelClass } from 'texuli/field';
import { PinInput } from 'texuli/number-pin';

/**
 * OtpInput — fixed-length one-time-code entry: a thin adapter over Texuli's
 * `PinInput` (`texuli/number-pin`). One real input (one-time-code autofill,
 * paste, backspace and arrows) drawn as cells. Simulation UX only: it never
 * sends SMS, verifies codes or authenticates anyone. Wire `onComplete` to a
 * prototype service that decides what the filled code means.
 */
interface Props {
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
}

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
}: Props = $props();

const uid = $props.id();
const fieldId = $derived(id ?? `otp-${uid}`);
const cellCount = $derived(Math.min(12, Math.max(2, Math.floor(length) || 6)));
// Texuli's styled PinInput.Root forwards `name` to its input but does not type it.
const nameAttr = $derived<Record<string, unknown>>(name ? { name } : {});
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

// Texuli's styled PinInput.Root does not forward `bind:inputRef`, so the field is found by id.
onMount(() => {
  if (autofocus && !disabled) document.getElementById(fieldId)?.focus();
});
</script>

<div class={className} data-py-otp="">
  <label for={fieldId} class={labelClass()}>{label}</label>
  <PinInput.Root
    bind:value={() => value, setValue}
    inputId={fieldId}
    maxlength={cellCount}
    pattern={regexp}
    pasteTransformer={cleanPaste}
    {disabled}
    {...nameAttr}
  >
    {#snippet children({ cells })}
      {#each cells as cell, index (index)}
        <PinInput.Cell {cell} />
      {/each}
    {/snippet}
  </PinInput.Root>
</div>
