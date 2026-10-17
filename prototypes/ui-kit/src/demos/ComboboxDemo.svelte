<script lang="ts">
import { Button, Combobox, FormField, type SelectOption } from '@protoyard/ui';

const timezones: SelectOption[] = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Bogota',
  'America/Sao_Paulo',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'Europe/Athens',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
].map((zone) => ({ value: zone, label: zone.replace('_', ' ') }));

let timezone = $state('Europe/Madrid');
let language = $state('');
</script>

<div class="grid max-w-sm gap-5">
  <FormField label="Time zone" description="Type to filter 21 zones, e.g. “asia”.">
    {#snippet children({ props })}
      <Combobox {...props} items={timezones} bind:value={timezone} placeholder="Search time zones…" />
    {/snippet}
  </FormField>
  <div class="flex flex-wrap items-center gap-3">
    <p class="text-xs text-muted-foreground" aria-live="polite">Value: {timezone || 'none'}</p>
    <Button size="sm" variant="outline" onclick={() => (timezone = 'Asia/Tokyo')}>Set Tokyo</Button>
    <Button size="sm" variant="ghost" onclick={() => (timezone = '')}>Clear</Button>
  </div>

  <FormField label="Language" error={language ? undefined : 'Pick a language.'}>
    {#snippet children({ props })}
      <Combobox
        {...props}
        bind:value={language}
        emptyText="No language matches"
        items={[
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Spanish' },
          { value: 'pt', label: 'Portuguese' },
          { value: 'fr', label: 'French' },
          { value: 'de', label: 'German' },
        ]}
      />
    {/snippet}
  </FormField>

  <FormField label="Country (disabled)">
    {#snippet children({ props })}
      <Combobox {...props} disabled value="co" items={[{ value: 'co', label: 'Colombia' }]} />
    {/snippet}
  </FormField>
</div>
