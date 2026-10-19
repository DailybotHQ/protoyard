<script lang="ts">
import { Button } from '@protoyard/ui';
import { AppCommandPalette, createCommands } from '@protoyard/views-ui/commands';

let last = $state('No command run yet.');
const session = { can: () => true, assert: () => {}, subscribe: () => () => {} };
const registry = createCommands({ session }, [
  { path: '/', name: 'Overview' },
  { path: '/settings', name: 'Settings', description: 'Preferences' },
]);
registry.register({
  id: 'new-note',
  label: 'Create note',
  keywords: ['add'],
  run: async () => {
    await Promise.resolve();
    last = 'Created a sample note locally.';
  },
});
</script>
<div class="space-y-3"><p class="text-sm text-muted-foreground" aria-live="polite">{last}</p><AppCommandPalette {registry}>{#snippet trigger({ open })}<Button variant="outline" onclick={open}>Open command palette · Ctrl/⌘ K</Button>{/snippet}</AppCommandPalette></div>
