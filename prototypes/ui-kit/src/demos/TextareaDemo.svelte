<script lang="ts">
import { Button, Label, Textarea } from '@protoyard/ui';

const LIMIT = 280;
let bio = $state('Product designer who loves tidy spreadsheets and long walks.');
const remaining = $derived(LIMIT - bio.length);
</script>

<div class="grid max-w-md gap-5">
  <div class="grid gap-1.5">
    <Label for="textarea-demo-bio">Bio</Label>
    <Textarea
      id="textarea-demo-bio"
      bind:value={bio}
      maxlength={LIMIT}
      aria-describedby="textarea-demo-count"
      placeholder="Tell people about yourself"
    />
    <div class="flex items-center justify-between gap-2">
      <p
        id="textarea-demo-count"
        class={remaining < 20 ? 'text-xs font-medium text-foreground' : 'text-xs text-muted-foreground'}
      >
        {remaining} characters left
      </p>
      <Button size="sm" variant="ghost" onclick={() => (bio = '')} disabled={bio.length === 0}>
        Clear
      </Button>
    </div>
  </div>

  <div class="grid gap-1.5">
    <Label for="textarea-demo-invalid">Release notes</Label>
    <Textarea
      id="textarea-demo-invalid"
      aria-invalid="true"
      aria-describedby="textarea-demo-invalid-msg"
      placeholder="Required"
    />
    <p id="textarea-demo-invalid-msg" class="text-xs font-medium text-destructive">
      Release notes are required.
    </p>
  </div>

  <div class="grid gap-1.5">
    <Label for="textarea-demo-disabled">Archived note (disabled)</Label>
    <Textarea id="textarea-demo-disabled" disabled value="This note is read-only." />
  </div>
</div>
