<script lang="ts">
import { MessageSquare } from '@lucide/svelte';
import { LucideIcon } from 'texuli/icons/lucide';

let { class: className = '' }: { class?: string } = $props();
</script>

<LucideIcon icon={MessageSquare} class={className} />
