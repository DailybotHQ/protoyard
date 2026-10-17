<script lang="ts">
import { Button, Progress } from '@protoyard/ui';

let upload = $state(0);
let running = $state(false);
let indeterminate = $state(true);

$effect(() => {
  if (!running) return;
  const handle = setInterval(() => {
    upload = Math.min(100, upload + 7);
    if (upload >= 100) running = false;
  }, 250);
  return () => clearInterval(handle);
});
</script>

<div class="grid max-w-md gap-6">
  <div class="grid gap-3">
    <Progress
      label="Uploading report.pdf"
      value={upload}
      showValue
      tone={upload >= 100 ? 'success' : 'primary'}
    />
    <div class="flex flex-wrap gap-2">
      <Button size="sm" onclick={() => (running = !running)} disabled={upload >= 100}>
        {running ? 'Pause' : upload > 0 ? 'Resume' : 'Start upload'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onclick={() => {
          running = false;
          upload = 0;
        }}
      >
        Reset
      </Button>
    </div>
  </div>

  <div class="grid gap-3">
    <p class="text-xs text-muted-foreground">Tones and sizes</p>
    <Progress label="Storage" value={92} showValue tone="warning" />
    <Progress label="Failed checks" value={3} max={20} showValue tone="destructive" size="sm" />
    <Progress ariaLabel="Profile completeness" value={60} tone="info" size="sm" />
  </div>

  <div class="grid gap-3">
    <Progress label="Syncing" value={indeterminate ? null : 100} tone="primary" />
    <Button size="sm" variant="outline" class="justify-self-start" onclick={() => (indeterminate = !indeterminate)}>
      {indeterminate ? 'Finish sync' : 'Sync again (indeterminate)'}
    </Button>
  </div>
</div>
