<script lang="ts">
import type { Segment } from '../domain/wiki.ts';

/** Text with search matches in <mark>, built from segments (text only, never HTML). */
let { segments }: { segments: Segment[] } = $props();
</script>

{#each segments as s, i (i)}{#if s.match}<mark class="rounded-sm bg-warning/40 px-0.5 text-foreground">{s.text}</mark>{:else}{s.text}{/if}{/each}
