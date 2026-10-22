<script lang="ts">
import type { TerminalBlock } from '@protoyard/blocks';

/**
 * A terminal session as text: prompts, output and comments in order. The
 * `$` marker is decoration; assistive tech hears "Command:" instead.
 */
let { block }: { block: TerminalBlock } = $props();

const commands = $derived(block.lines.filter((line) => line.kind === 'prompt').length);
</script>

<figure class="grid gap-2" data-py-diagram="terminal">
  <div class="overflow-hidden rounded-lg border border-border bg-surface text-surface-foreground">
    <div class="flex items-center gap-1.5 border-b border-border px-3 py-2" aria-hidden="true">
      <span class="size-2.5 rounded-full bg-muted-foreground/40"></span>
      <span class="size-2.5 rounded-full bg-muted-foreground/40"></span>
      <span class="size-2.5 rounded-full bg-muted-foreground/40"></span>
    </div>
    <ol
      class="grid gap-0.5 p-3 font-mono text-[13px] leading-relaxed"
      aria-label="Terminal session, {commands} {commands === 1 ? 'command' : 'commands'}"
    >
      {#each block.lines as line, index (index)}
        <li class={['whitespace-pre-wrap break-words', line.kind === 'comment' && 'italic text-muted-foreground', line.kind === 'output' && 'text-surface-foreground']} data-kind={line.kind}>
          {#if line.kind === 'prompt'}<span class="select-none font-semibold text-primary" aria-hidden="true">{'$ '}</span><span class="sr-only">{'Command: '}</span><span class="font-semibold">{line.text}</span>{:else}{line.text}{/if}
        </li>
      {/each}
    </ol>
  </div>
</figure>
