<script lang="ts">
import FormField from '../../src/components/form-field/FormField.svelte';
import Kanban from '../../src/components/kanban/Kanban.svelte';
import Select from '../../src/components/select/Select.svelte';

let stage = $state('');
</script>

<FormField label="Stage" required>
  {#snippet children({ props })}
    <Select {...props} items={[{ value: 'lead', label: 'Lead' }]} bind:value={stage} />
  {/snippet}
</FormField>
<Kanban
  columns={[{ id: 'todo', title: 'To do' }]}
  items={[{ id: 'a', title: 'A', status: 'todo' }]}
  getColumn={(t) => t.status}
  getItemId={(t) => t.id}
  headingLevel={2}
>
  {#snippet card(t)}<span>{t.title}</span>{/snippet}
</Kanban>
