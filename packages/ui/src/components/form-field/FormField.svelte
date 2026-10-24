<script lang="ts">
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { Label } from 'texuli/field';
import { cn } from '../../lib/cn.ts';
import type { FormFieldControl } from './form-field.ts';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: string;
  description?: string;
  /** Error message; when present the control is marked `aria-invalid`. */
  error?: string | null;
  required?: boolean;
  /** Control id; generated when omitted. */
  id?: string;
  /** Visually hide the label (it stays available to assistive tech). */
  hideLabel?: boolean;
  children: Snippet<[FormFieldControl]>;
}

const uid = $props.id();

let {
  label,
  description,
  error,
  required = false,
  id = `field-${uid}`,
  hideLabel = false,
  class: className,
  children,
  ...rest
}: Props = $props();

const descriptionId = $derived(`${id}-description`);
const errorId = $derived(`${id}-error`);
const invalid = $derived(Boolean(error));
const describedBy = $derived(
  [description ? descriptionId : null, invalid ? errorId : null].filter(Boolean).join(' ') ||
    undefined
);
const control: FormFieldControl = $derived({
  id,
  describedBy,
  invalid,
  required,
  props: {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
    'aria-required': required || undefined,
  },
});
</script>

<div class={cn('grid gap-1.5', className)} {...rest}>
  <Label for={id} {required} class={hideLabel ? 'sr-only' : undefined}>{label}</Label>
  {@render children(control)}
  {#if description}
    <p id={descriptionId} class="text-xs text-muted-foreground">{description}</p>
  {/if}
  {#if invalid}
    <p id={errorId} class="text-xs font-medium text-destructive">{error}</p>
  {/if}
</div>
