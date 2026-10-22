<script lang="ts">
/**
 * Short markdown body as plain text nodes only — no HTML, no {@html}.
 * Structure blocks keep the chunk small by skipping a full rich renderer.
 */
let { text = '' }: { text?: string } = $props();

/** Strip common markdown markers; keep line breaks as paragraphs. */
function plain(source: string): string[] {
  return source
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim()
    )
    .filter(Boolean);
}

const paragraphs = $derived(plain(text));
</script>

{#if paragraphs.length > 0}
  <div class="grid gap-1.5 text-sm leading-relaxed text-muted-foreground">
    {#each paragraphs as paragraph, i (i)}
      <p>{paragraph}</p>
    {/each}
  </div>
{/if}
