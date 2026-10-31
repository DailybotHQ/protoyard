<script lang="ts">
import DatePicker from '../../src/components/form/scheduling/DatePicker.svelte';
import DateRangePicker from '../../src/components/form/scheduling/DateRangePicker.svelte';
import TimeInput from '../../src/components/form/scheduling/TimeInput.svelte';
import WeekdayPicker from '../../src/components/form/scheduling/WeekdayPicker.svelte';
import { FormField } from '../../src/index.ts';

let { error = null }: { error?: string | null } = $props();
</script>

<FormField label="Send at" description="Local time" {error} required>
  {#snippet children(control)}
    <TimeInput {...control.props} label="Send at" format={24} />
  {/snippet}
</FormField>
<FormField label="Repeat on" {error}>
  {#snippet children(control)}
    <WeekdayPicker {...control.props} label="Repeat on" />
  {/snippet}
</FormField>
<FormField label="Starts" {error} required>
  {#snippet children(control)}
    <DatePicker {...control.props} />
  {/snippet}
</FormField>
<FormField label="Stay" {error} required>
  {#snippet children(control)}
    <DateRangePicker {...control.props} locale="en-US" />
  {/snippet}
</FormField>
