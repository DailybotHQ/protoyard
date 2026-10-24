<script lang="ts">
import { Switch } from 'texuli/choice';

/**
 * Boolean switch for the DevTools panel, on Texuli's Switch.
 * Same props as the previous panel control so section call sites stay stable.
 */
let {
  checked,
  label,
  onchange,
  disabled = false,
  hideLabel = false,
}: {
  checked: boolean;
  label: string;
  onchange: (checked: boolean) => void;
  disabled?: boolean;
  hideLabel?: boolean;
} = $props();
</script>

{#if hideLabel}
  <Switch
    {checked}
    {disabled}
    size="sm"
    onCheckedChange={onchange}
    aria-label={label}
    data-py-devtools-toggle=""
  />
{:else}
  <Switch
    {checked}
    {disabled}
    size="sm"
    {label}
    onCheckedChange={onchange}
    data-py-devtools-toggle=""
  />
{/if}
