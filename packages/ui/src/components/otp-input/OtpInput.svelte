<script lang="ts">
import { cn } from '../../lib/cn.ts';
import { fieldClasses } from '../input/input-classes.ts';

/**
 * OtpInput — fixed-length one-time-code entry with per-cell focus, paste,
 * backspace and arrow movement. Simulation UX only: it never sends SMS,
 * verifies codes or authenticates anyone. Wire `onComplete` to a prototype
 * service that decides what the filled code means.
 */
interface Props {
  /** Bound code string (digits or allowed characters only). */
  value?: string;
  /** Accessible group label (fieldset legend). */
  label: string;
  /** Number of cells (2–12). Default 6. */
  length?: number;
  /** Characters accepted. Default digits only. */
  pattern?: 'digits' | 'alphanumeric';
  disabled?: boolean;
  /** Autofocus the first empty cell on mount. */
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

let boxes: Array<HTMLInputElement | undefined> = $state([]);
/** Last code that already fired onComplete — prevents repeat fires while full. */
let completedFor = $state<string | null>(null);

const sanitizeChar = (raw: string): string => {
  const cleaned =
    pattern === 'alphanumeric' ? raw.replace(/[^a-zA-Z0-9]/g, '') : raw.replace(/\D/g, '');
  return cleaned.slice(-1).toUpperCase();
};

const sanitizeCode = (raw: string, max = cellCount): string => {
  const cleaned =
    pattern === 'alphanumeric' ? raw.replace(/[^a-zA-Z0-9]/g, '') : raw.replace(/\D/g, '');
  return cleaned.slice(0, max).toUpperCase();
};

const digits = $derived(
  Array.from({ length: cellCount }, (_, index) => sanitizeCode(value)[index] ?? '')
);

function emit(next: string) {
  const code = sanitizeCode(next);
  value = code;
  onValueChange?.(code);
  if (code.length === cellCount) {
    if (completedFor !== code) {
      completedFor = code;
      onComplete?.(code);
    }
  } else {
    completedFor = null;
  }
}

function writeDigit(index: number, input: string) {
  if (disabled) return;
  const char = sanitizeChar(input);
  const next = Array.from({ length: cellCount }, (_, position) => digits[position] ?? '');
  next[index] = char;
  emit(next.join(''));
  if (char && index < cellCount - 1) boxes[index + 1]?.focus();
}

function paste(event: ClipboardEvent, index: number) {
  if (disabled) return;
  event.preventDefault();
  const pasted = sanitizeCode(event.clipboardData?.getData('text') ?? '', cellCount - index);
  if (!pasted) return;
  const next = Array.from({ length: cellCount }, (_, position) => digits[position] ?? '');
  for (let offset = 0; offset < pasted.length; offset += 1) {
    next[index + offset] = pasted[offset] ?? '';
  }
  emit(next.join(''));
  boxes[Math.min(index + pasted.length, cellCount - 1)]?.focus();
}

function keydown(event: KeyboardEvent, index: number) {
  if (disabled) return;
  if (event.key === 'Backspace') {
    if (digits[index]) {
      // Clear current cell; stay put.
      const next = Array.from({ length: cellCount }, (_, position) => digits[position] ?? '');
      next[index] = '';
      emit(next.join(''));
      event.preventDefault();
    } else if (index > 0) {
      boxes[index - 1]?.focus();
      const next = Array.from({ length: cellCount }, (_, position) => digits[position] ?? '');
      next[index - 1] = '';
      emit(next.join(''));
      event.preventDefault();
    }
    return;
  }
  if (event.key === 'ArrowLeft' && index > 0) {
    event.preventDefault();
    boxes[index - 1]?.focus();
  } else if (event.key === 'ArrowRight' && index < cellCount - 1) {
    event.preventDefault();
    boxes[index + 1]?.focus();
  } else if (event.key === 'Home') {
    event.preventDefault();
    boxes[0]?.focus();
  } else if (event.key === 'End') {
    event.preventDefault();
    boxes[cellCount - 1]?.focus();
  }
}

$effect(() => {
  if (!autofocus || disabled) return;
  const firstEmpty = digits.findIndex((digit) => !digit);
  const target = firstEmpty < 0 ? cellCount - 1 : firstEmpty;
  // Defer so the fieldset is in the DOM.
  queueMicrotask(() => boxes[target]?.focus());
});
</script>

<fieldset
  class={cn('grid gap-3', className)}
  disabled={disabled || undefined}
  data-otp-length={cellCount}
>
  <legend class="text-sm font-medium text-foreground">{label}</legend>
  {#if name}
    <input type="hidden" {name} value={sanitizeCode(value)} />
  {/if}
  <div class="flex flex-wrap gap-2" style:--otp-cells={cellCount}>
    {#each digits as digit, index (index)}
      <input
        bind:this={boxes[index]}
        id={index === 0 ? fieldId : `${fieldId}-${index + 1}`}
        aria-label={`Digit ${index + 1} of ${cellCount}`}
        autocomplete={index === 0 ? 'one-time-code' : 'off'}
        inputmode={pattern === 'digits' ? 'numeric' : 'text'}
        maxlength="1"
        pattern={pattern === 'digits' ? '[0-9]*' : '[A-Za-z0-9]*'}
        type="text"
        {disabled}
        value={digit}
        spellcheck="false"
        autocapitalize="characters"
        class={cn(
          fieldClasses,
          'h-12 w-10 min-h-touch min-w-10 px-0 text-center text-xl font-semibold tabular-nums sm:h-11 sm:min-h-0 sm:w-9 sm:min-w-9 sm:text-lg'
        )}
        oninput={(event) => writeDigit(index, event.currentTarget.value)}
        onpaste={(event) => paste(event, index)}
        onkeydown={(event) => keydown(event, index)}
        onfocus={(event) => event.currentTarget.select()}
      />
    {/each}
  </div>
</fieldset>
