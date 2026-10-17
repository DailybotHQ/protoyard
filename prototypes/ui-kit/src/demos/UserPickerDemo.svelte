<script lang="ts">
import { Label, toast, UserPicker } from '@protoyard/ui';
import { PEOPLE } from './members.ts';

let assignee = $state('u-omar');
let reviewer = $state('');
const reviewerName = $derived(PEOPLE.find((person) => person.id === reviewer)?.name);
</script>

<div class="grid gap-6 md:grid-cols-2">
  <div class="grid content-start gap-1.5">
    <Label for="user-picker-demo-assignee">Assignee</Label>
    <UserPicker
      id="user-picker-demo-assignee"
      users={PEOPLE}
      bind:value={assignee}
      label="Assignee"
      onValueChange={(_, user) => toast.success(`Assigned to ${user.name}`)}
    />
    <p class="text-xs text-muted-foreground">Popover variant. Type to search by name or team.</p>
  </div>
  <div class="grid content-start gap-1.5">
    <p class="text-sm font-medium">Reviewer (inline)</p>
    <UserPicker users={PEOPLE} bind:value={reviewer} variant="inline" label="Reviewer" />
    <p class="text-xs text-muted-foreground" aria-live="polite">
      {reviewerName ? `Reviewer: ${reviewerName}` : 'Pick a reviewer with the arrow keys and Enter.'}
    </p>
  </div>
</div>
