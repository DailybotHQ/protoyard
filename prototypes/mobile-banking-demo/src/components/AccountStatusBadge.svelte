<script lang="ts">
import { Lock, Moon } from '@lucide/svelte';
import { Badge } from '@protoyard/ui';
import type { AccountStatus } from '../database/schema.ts';

let { status }: { status: AccountStatus } = $props();
</script>

{#if status === 'locked'}
  <Badge variant="destructive"><Lock aria-hidden="true" />Locked</Badge>
{:else if status === 'dormant'}
  <Badge variant="warning"><Moon aria-hidden="true" />Dormant</Badge>
{/if}
