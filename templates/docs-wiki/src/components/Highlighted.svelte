<script lang="ts">
import type { Segment } from '../domain/wiki.ts';

/** Text with search matches in <mark> (the browser's highlight colors), built from segments (text only, never HTML). */
let { segments }: { segments: Segment[] } = $props();
</script>

{#each segments as s, i (i)}{#if s.match}<mark class="px-0.5">{s.text}</mark>{:else}{s.text}{/if}{/each}
