<script lang="ts">
import { Kbd, Label } from '@protoyard/ui';

const shortcuts = [
  { keys: ['⌘', 'K'], label: 'Open command palette' },
  { keys: ['⇧', '?'], label: 'Show keyboard shortcuts' },
  { keys: ['G', 'I'], label: 'Go to inbox' },
  { keys: ['Esc'], label: 'Close dialog' },
];

let combo = $state<string[]>([]);

function capture(event: KeyboardEvent): void {
  if (event.key === 'Tab') return;
  event.preventDefault();
  const keys: string[] = [];
  if (event.metaKey) keys.push('⌘');
  if (event.ctrlKey) keys.push('Ctrl');
  if (event.altKey) keys.push('Alt');
  if (event.shiftKey) keys.push('⇧');
  if (!['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) {
    keys.push(
      event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
    );
  }
  combo = keys;
}
</script>

<div class="grid max-w-md gap-5">
  <ul class="grid gap-2 text-sm">
    {#each shortcuts as shortcut (shortcut.label)}
      <li class="flex items-center justify-between gap-3">
        <span>{shortcut.label}</span>
        <span class="flex gap-1">
          {#each shortcut.keys as key (key)}<Kbd>{key}</Kbd>{/each}
        </span>
      </li>
    {/each}
  </ul>
  <div class="grid gap-1.5">
    <Label for="kbd-demo-capture">Press a key combination</Label>
    <input
      id="kbd-demo-capture"
      readonly
      onkeydown={capture}
      placeholder="Focus here and press keys"
      class="h-9 rounded-md border border-input bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      value={combo.join(' + ')}
    />
    <p class="flex min-h-5 items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
      {#if combo.length}
        You pressed {#each combo as key, index (index)}<Kbd>{key}</Kbd>{/each}
      {:else}
        Tab still moves focus.
      {/if}
    </p>
  </div>
</div>
