<script lang="ts">
import Combobox from '../../src/components/combobox/Combobox.svelte';
import DropdownMenu from '../../src/components/dropdown-menu/DropdownMenu.svelte';
import { matchesTimeZone } from '../../src/components/form/scheduling/timezones.ts';
import Popover from '../../src/components/popover/Popover.svelte';
import UserPicker from '../../src/components/user-picker/UserPicker.svelte';
import { Button, Tooltip } from '../../src/index.ts';

interface Props {
  onSelected?: (label: string) => void;
}

let { onSelected }: Props = $props();

let zone = $state('');
let person = $state('');
let popoverRef = $state<HTMLElement | null>(null);
let focusTarget = $state<HTMLButtonElement | null>(null);
</script>

<form data-testid="form">
  <Combobox
    aria-label="Time zone"
    name="zone"
    required
    filter={matchesTimeZone}
    items={[
      { value: 'America/Sao_Paulo', label: 'São Paulo' },
      { value: 'America/New_York', label: 'New York' },
      { value: 'Asia/Tokyo', label: 'Tokyo' },
    ]}
    bind:value={zone}
  />
</form>

<Tooltip content="Saves the draft">
  {#snippet children({ props })}<Button {...props}>Save</Button>{/snippet}
</Tooltip>

<DropdownMenu
  items={[
    { type: 'label', label: 'Deal' },
    { label: 'Rename', onSelect: () => onSelected?.('Rename') },
    { type: 'separator' },
    { label: 'Delete', destructive: true, onSelect: () => onSelected?.('Delete') },
  ]}
>
  {#snippet trigger({ props })}<Button {...props}>Actions</Button>{/snippet}
</DropdownMenu>

<Popover bind:ref={popoverRef} initialFocus={() => focusTarget}>
  {#snippet trigger({ props })}<Button {...props}>Filters</Button>{/snippet}
  <button type="button">First</button>
  <button type="button" bind:this={focusTarget}>Preferred</button>
</Popover>
<p data-testid="popover-ref">{popoverRef ? popoverRef.getAttribute('role') : 'none'}</p>

<UserPicker
  label="Owner"
  bind:value={person}
  users={[
    { id: 'u1', name: 'Ada Example', subtitle: 'Design' },
    { id: 'u2', name: 'Bo Example', subtitle: 'Finance' },
  ]}
/>
<p data-testid="person">{person}</p>
