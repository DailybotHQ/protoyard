<script lang="ts">
import LazyDropdownMenu from '../../src/lib/LazyDropdownMenu.svelte';

let archived = $state(false);
</script>

<LazyDropdownMenu items={[{ label: 'Archive', onSelect: () => (archived = true) }]} button={{ 'aria-label': 'Card options' }}>⋯</LazyDropdownMenu>
<p>{archived ? 'Archived' : 'Active'}</p>
