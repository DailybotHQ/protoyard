<script lang="ts">
import { Link, Mail, MessageSquare } from '@lucide/svelte';
import { BottomSheet, Button, Switch, toast } from '@protoyard/ui';

const targets = [
  { id: 'link', label: 'Copy link', icon: Link },
  { id: 'email', label: 'Send by email', icon: Mail },
  { id: 'chat', label: 'Share in team chat', icon: MessageSquare },
];

let shareOpen = $state(false);
let settingsOpen = $state(false);
let lowData = $state(false);
let offline = $state(true);
let lastShare = $state<string | null>(null);
</script>

<div class="flex flex-wrap items-center gap-3">
  <BottomSheet bind:open={shareOpen} title="Share “Q3 roadmap”" description="Choose how to share.">
    {#snippet trigger({ props })}
      <Button {...props}>Share</Button>
    {/snippet}
    <ul class="grid gap-1">
      {#each targets as target (target.id)}
        <li>
          <Button
            type="button"
            class="flex min-h-touch w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onclick={() => {
              lastShare = target.label;
              shareOpen = false;
              toast.success(target.label, { description: 'Demo share completed.' });
            }}
          >
            <target.icon class="size-5 text-muted-foreground" aria-hidden="true" />
            {target.label}
          </Button>
        </li>
      {/each}
    </ul>
  </BottomSheet>

  <BottomSheet bind:open={settingsOpen} title="Sync settings" swipeToDismiss={false}>
    {#snippet trigger({ props })}
      <Button {...props} variant="outline">Settings (no swipe)</Button>
    {/snippet}
    <div class="grid gap-4 py-2 text-left">
      <Switch label="Low data mode" description="Skip images on cellular." bind:checked={lowData} />
      <Switch label="Offline copies" description="Keep the last 30 days." bind:checked={offline} />
    </div>
    {#snippet footer()}
      <Button
        onclick={() => {
          settingsOpen = false;
          toast.success('Sync settings saved');
        }}
      >
        Save
      </Button>
    {/snippet}
  </BottomSheet>
</div>
<p class="mt-3 text-xs text-muted-foreground" aria-live="polite">
  Drag the handle down to dismiss, or press Esc. {lastShare ? `Last share: ${lastShare}.` : ''}
</p>
