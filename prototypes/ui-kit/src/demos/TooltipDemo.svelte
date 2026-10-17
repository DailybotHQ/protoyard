<script lang="ts">
import { Bold, Italic, Underline } from '@lucide/svelte';
import { Button, Kbd, Switch, Tooltip } from '@protoyard/ui';
import { withClick } from './nav.ts';

const tools = [
  { id: 'bold', label: 'Bold', shortcut: '⌘B', icon: Bold },
  { id: 'italic', label: 'Italic', shortcut: '⌘I', icon: Italic },
  { id: 'underline', label: 'Underline', shortcut: '⌘U', icon: Underline },
] as const;

let active = $state<Record<string, boolean>>({ bold: true, italic: false, underline: false });
let tooltipsOff = $state(false);
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1 w-fit" role="group" aria-label="Formatting">
    {#each tools as tool (tool.id)}
      <Tooltip disabled={tooltipsOff}>
        {#snippet content()}
          <span class="flex items-center gap-1.5">{tool.label} <Kbd>{tool.shortcut}</Kbd></span>
        {/snippet}
        {#snippet children({ props })}
          <Button
            {...withClick(props, () => (active[tool.id] = !active[tool.id]))}
            size="icon"
            variant={active[tool.id] ? 'secondary' : 'ghost'}
            aria-label={tool.label}
            aria-pressed={active[tool.id] ?? false}
          >
            <tool.icon aria-hidden="true" />
          </Button>
        {/snippet}
      </Tooltip>
    {/each}
  </div>

  <div class="flex flex-wrap gap-3">
    {#each ['top', 'right', 'bottom', 'left'] as const as side (side)}
      <Tooltip content={`Shown on the ${side}`} {side} disabled={tooltipsOff}>
        {#snippet children({ props })}
          <Button {...props} variant="outline" size="sm">{side}</Button>
        {/snippet}
      </Tooltip>
    {/each}
  </div>

  <Switch label="Disable tooltips" bind:checked={tooltipsOff} class="max-w-xs" />
  <p class="text-xs text-muted-foreground">Hover or focus a button. Esc hides the tooltip.</p>
</div>
