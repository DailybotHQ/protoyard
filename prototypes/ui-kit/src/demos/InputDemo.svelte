<script lang="ts">
import { Button, Input, Label } from '@protoyard/ui';

let name = $state('');
let email = $state('not-an-email');
let password = $state('');
let showPassword = $state(false);
let files = $state<FileList | null>(null);

const emailInvalid = $derived(email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
</script>

<div class="grid max-w-md gap-5">
  <div class="grid gap-1.5">
    <Label for="input-demo-name">Full name</Label>
    <Input id="input-demo-name" bind:value={name} placeholder="Jordan Example" autocomplete="name" />
    <p class="text-xs text-muted-foreground">
      {name ? `Hello, ${name}!` : 'Type to see the bound value.'}
    </p>
  </div>

  <div class="grid gap-1.5">
    <Label for="input-demo-email">Email</Label>
    <Input
      id="input-demo-email"
      type="email"
      bind:value={email}
      aria-invalid={emailInvalid || undefined}
      aria-describedby="input-demo-email-msg"
    />
    <p
      id="input-demo-email-msg"
      class={emailInvalid ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}
    >
      {emailInvalid ? 'Enter a valid email, like ana@example.com.' : 'Looks good.'}
    </p>
  </div>

  <div class="grid gap-1.5">
    <Label for="input-demo-password">Password</Label>
    <div class="flex gap-2">
      <Input
        id="input-demo-password"
        type={showPassword ? 'text' : 'password'}
        bind:value={password}
        autocomplete="new-password"
      />
      <Button
        type="button"
        variant="link"
        class="shrink-0 rounded-md px-2 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-pressed={showPassword}
        onclick={() => (showPassword = !showPassword)}
      >
        {showPassword ? 'Hide' : 'Show'}
      </Button>
    </div>
    <p class="text-xs text-muted-foreground">{password.length} characters</p>
  </div>

  <div class="grid gap-1.5">
    <Label for="input-demo-disabled">Workspace ID (disabled)</Label>
    <Input id="input-demo-disabled" value="ws_4821" disabled />
  </div>

  <div class="grid gap-1.5">
    <Label for="input-demo-file">Attachment</Label>
    <Input id="input-demo-file" type="file" bind:files />
    <p class="text-xs text-muted-foreground">
      {files && files.length > 0 ? `Selected: ${files[0]?.name}` : 'No file selected.'}
    </p>
  </div>
</div>
