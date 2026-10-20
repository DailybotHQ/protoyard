<script lang="ts">
import { Search } from '@lucide/svelte';
import { navigate } from '@protoyard/renderer-svelte';
import { Button, Input } from '@protoyard/ui';

/** A search box that opens the Search screen with `?q=` (the query lives in the URL). */
let { value = '', autofocus = false }: { value?: string; autofocus?: boolean } = $props();
let q = $state('');
$effect.pre(() => {
  q = value;
});
</script>

<form
  role="search"
  class="flex w-full max-w-xl gap-2"
  onsubmit={(event) => {
    event.preventDefault();
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  }}
>
  <!-- svelte-ignore a11y_autofocus -->
  <Input type="search" bind:value={q} aria-label="Search pages" placeholder="Search titles and text" {autofocus} class="flex-1" />
  <Button type="submit" variant="secondary"><Search class="size-4" aria-hidden="true" />Search</Button>
</form>
