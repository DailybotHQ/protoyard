<script lang="ts">
import { Lock, Moon } from '@lucide/svelte';
import { Badge } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import type { AccountStatus } from '../database/schema.ts';

let { status }: { status: AccountStatus } = $props();
</script>

{#if status === 'locked'}
  <Badge variant="destructive"><LucideIcon icon={Lock} />Locked</Badge>
{:else if status === 'dormant'}
  <Badge variant="warning"><LucideIcon icon={Moon} />Dormant</Badge>
{/if}
