<script lang="ts">
import Combobox from '../../combobox/Combobox.svelte';
import type { SelectOption } from '../../select/types.ts';
import { listTimeZones, matchesTimeZone, timeZoneOptions } from './timezones.ts';

/**
 * TimeZoneSelect — a searchable list of IANA zones labelled with their UTC
 * offset, for example `(GMT-05:00) America/Bogota`, sorted west to east. A
 * search matches any part of the label or the zone name. Offsets are those in
 * force at `referenceDate`; pass the scenario clock so a prototype stays
 * deterministic.
 */
interface Props {
  /** IANA zone name. */
  value?: string;
  referenceDate?: Date | number;
  /** Restrict the list (defaults to every zone the browser knows). */
  zones?: readonly string[];
  id?: string;
  name?: string;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-describedby'?: string;
  /** From FormField; treated like `required`. */
  'aria-required'?: boolean | 'true' | 'false';
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-label'?: string;
  class?: string;
  onValueChange?: (zone: string) => void;
}

let {
  value = $bindable('UTC'),
  referenceDate = new Date(),
  zones,
  id,
  name,
  placeholder = 'Search a time zone',
  emptyText = 'No time zone matches',
  disabled = false,
  required: requiredProp = false,
  'aria-describedby': describedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  class: className,
  onValueChange,
}: Props = $props();

const required = $derived(requiredProp || ariaRequired === true || ariaRequired === 'true');

const items: SelectOption[] = $derived(
  timeZoneOptions(referenceDate, zones ?? listTimeZones()).map((option) => ({
    value: option.value,
    label: option.label,
  }))
);
</script>

<Combobox
  bind:value
  {items}
  {id}
  {name}
  {placeholder}
  {emptyText}
  {disabled}
  {required}
  filter={matchesTimeZone}
  aria-describedby={describedBy}
  aria-invalid={ariaInvalid}
  aria-label={ariaLabel}
  class={className}
  {onValueChange}
/>
