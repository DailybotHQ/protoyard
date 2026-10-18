<script lang="ts">
import FilterBar from '../../src/components/filter-bar/FilterBar.svelte';
import type { FilterField, FilterValues } from '../../src/components/filter-bar/types.ts';

interface Props {
  fields: FilterField[];
  values?: FilterValues;
  onValuesChange?: (values: FilterValues) => void;
  label?: string;
  resetLabel?: string;
}

let { fields, values = $bindable({}), onValuesChange, label, resetLabel }: Props = $props();
</script>

<FilterBar {fields} bind:values {onValuesChange} {label} {resetLabel} />
