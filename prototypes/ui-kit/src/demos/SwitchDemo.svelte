<script lang="ts">
import { Switch } from '@protoyard/ui';

let digest = $state(true);
let mentions = $state(false);
let darkSidebar = $state(false);
</script>

<div class="grid max-w-md gap-5">
  <Switch
    label="Weekly digest"
    description="A summary of activity every Monday."
    bind:checked={digest}
  />
  <Switch label="Mentions only" description="Mute everything else." bind:checked={mentions} />
  <Switch label="SSO enforcement (disabled)" description="Managed by your admin." disabled checked />
  <div class="flex items-center gap-3">
    <Switch aria-label="Dark sidebar" bind:checked={darkSidebar} />
    <span class="text-sm">Without a visible label (uses <code>aria-label</code>)</span>
  </div>
  <p class="text-xs text-muted-foreground" aria-live="polite">
    Digest {digest ? 'on' : 'off'} · mentions only {mentions ? 'on' : 'off'} · dark sidebar
    {darkSidebar ? 'on' : 'off'}
  </p>
</div>
