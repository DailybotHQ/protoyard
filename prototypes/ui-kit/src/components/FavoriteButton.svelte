<script lang="ts">
import { Star } from '@lucide/svelte';
import { can, runService } from '@protoyard/renderer-svelte';
import { Button, Tooltip } from '@protoyard/ui';
import { CAPABILITIES } from '../domain/policy.ts';
import { favoritesService } from '../lib/services.ts';

let { entryId, name, starred }: { entryId: string; name: string; starred: boolean } = $props();
const allowed = $derived(can(CAPABILITIES.manage));
let busy = $state(false);

async function toggle() {
  busy = true;
  await runService(() => favoritesService().toggle(entryId));
  busy = false;
}
</script>

{#if allowed}
  <Button
    variant="ghost"
    size="icon"
    aria-pressed={starred}
    aria-label={starred ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
    loading={busy}
    onclick={toggle}
  >
    <Star class={starred ? 'size-4 fill-current text-warning' : 'size-4'} aria-hidden="true" />
  </Button>
{:else}
  <Tooltip content="Viewers can't change favorites. Switch persona in DevTools.">
    {#snippet children({ props })}
      <Button {...props} variant="ghost" size="icon" aria-disabled="true" aria-label={`${name} favorites are read-only`} onclick={(e: MouseEvent) => e.preventDefault()}>
        <Star class={starred ? 'size-4 fill-current text-warning' : 'size-4 opacity-50'} aria-hidden="true" />
      </Button>
    {/snippet}
  </Tooltip>
{/if}
