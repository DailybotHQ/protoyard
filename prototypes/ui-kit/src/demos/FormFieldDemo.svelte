<script lang="ts">
import { Button, FormField, Input, Select, toast } from '@protoyard/ui';

let username = $state('');
let role = $state('');
let submitted = $state(false);
let search = $state('');

const usernameError = $derived.by(() => {
  if (!submitted) return undefined;
  if (username.trim().length === 0) return 'Username is required.';
  if (username.trim().length < 3) return 'Use at least 3 characters.';
  if (!/^[a-z0-9-]+$/.test(username.trim())) return 'Only lowercase letters, numbers and dashes.';
  return undefined;
});
const roleError = $derived(submitted && !role ? 'Pick a role.' : undefined);

function submit(event: SubmitEvent): void {
  event.preventDefault();
  submitted = true;
  if (usernameError || roleError) return;
  toast.success('Member invited', { description: `@${username.trim()} as ${role}` });
  username = '';
  role = '';
  submitted = false;
}
</script>

<div class="grid max-w-md gap-6">
  <form class="grid gap-4" novalidate onsubmit={submit}>
    <FormField
      label="Username"
      description="Lowercase letters, numbers and dashes."
      error={usernameError}
      required
    >
      {#snippet children({ props })}
        <Input {...props} bind:value={username} autocomplete="off" placeholder="ana-lee" />
      {/snippet}
    </FormField>
    <FormField label="Role" error={roleError} required>
      {#snippet children({ props })}
        <Select
          {...props}
          bind:value={role}
          placeholder="Choose a role"
          items={[
            { value: 'admin', label: 'Admin' },
            { value: 'editor', label: 'Editor' },
            { value: 'viewer', label: 'Viewer' },
          ]}
        />
      {/snippet}
    </FormField>
    <div class="flex gap-2">
      <Button type="submit">Invite</Button>
      <Button
        variant="ghost"
        onclick={() => {
          username = '';
          role = '';
          submitted = false;
        }}
      >
        Reset
      </Button>
    </div>
    <p class="text-xs text-muted-foreground">Submit empty to see the errors, then fix the fields.</p>
  </form>

  <FormField label="Search members" hideLabel>
    {#snippet children({ props })}
      <Input {...props} type="search" bind:value={search} placeholder="Search members (label hidden)" />
    {/snippet}
  </FormField>
</div>
