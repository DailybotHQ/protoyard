<script lang="ts">
import { Switch } from '@protoyard/ui';

interface Props {
  label: string;
  description?: string;
  checked?: boolean;
  disabled?: boolean;
  /** Why it is disabled (shown instead of being a silent no-op). */
  disabledReason?: string;
  onCheckedChange?: (checked: boolean) => void;
}

let {
  label,
  description,
  checked = $bindable(false),
  disabled = false,
  disabledReason,
  onCheckedChange,
}: Props = $props();
const uid = $props.id();
const id = `pref-${uid}`;
const hint = $derived(
  [description, disabled ? disabledReason : undefined].filter(Boolean).join(' ')
);
</script>

<div class="flex items-start justify-between gap-4 py-3">
  <div class="min-w-0">
    <label for={id} class="text-sm font-medium">{label}</label>
    {#if hint}<p id={`${id}-hint`} class="mt-0.5 text-sm text-muted-foreground">{hint}</p>{/if}
  </div>
  <Switch {id} bind:checked {disabled} {onCheckedChange} aria-describedby={hint ? `${id}-hint` : undefined} />
</div>
