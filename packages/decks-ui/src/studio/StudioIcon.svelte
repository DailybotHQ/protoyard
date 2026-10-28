<script lang="ts">
import { Presentation } from '@lucide/svelte';
import { LucideIcon } from 'texuli/icons/lucide';

/** The presentation-screen glyph for the DevTools tab (Lucide, through Texuli's icon bridge). */
let { class: className = '' }: { class?: string } = $props();
</script>

<LucideIcon icon={Presentation} class={className} />
