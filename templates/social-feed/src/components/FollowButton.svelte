<script lang="ts">
import { can, runService } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import { CAPABILITIES } from '../domain/policy.ts';
import { useSocial } from '../lib/context.ts';

let { personId, name, following }: { personId: string; name: string; following: boolean } =
  $props();
const { services } = useSocial();
</script>

{#if can(CAPABILITIES.interact)}
  <Button
    size="sm"
    variant={following ? 'outline' : 'default'}
    aria-pressed={following}
    onclick={() => runService(() => services.follows.toggle(personId), { success: following ? `Unfollowed ${name}` : `Following ${name}` })}
  >
    {following ? 'Following' : 'Follow'}<span class="sr-only"> {name}</span>
  </Button>
{/if}
