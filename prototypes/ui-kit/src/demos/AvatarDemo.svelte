<script lang="ts">
import { Avatar, Input, Label } from '@protoyard/ui';
import { sampleFace } from './faces.ts';

const team = ['Ana Lee', 'Omar Diaz', 'Kai Moreno', 'Priya Shah', 'Lena Novak', 'Tomás Ruiz'];
const sizes = ['xs', 'sm', 'md', 'lg'] as const;
let name = $state('Jordan Example');
</script>

<div class="grid gap-5">
  <div class="flex flex-wrap items-end gap-3">
    {#each sizes as size (size)}
      <Avatar name="Ana Lee" {...sampleFace('Ana Lee')} {size} />
    {/each}
    <span class="text-xs text-muted-foreground">xs · sm · md · lg</span>
  </div>

  <div class="flex items-center">
    {#each team as member (member)}
      <Avatar name={member} {...sampleFace(member)} class="-ml-2 ring-2 ring-background first:ml-0" />
    {/each}
    <span class="ml-3 text-sm text-muted-foreground">{team.length} members</span>
  </div>

  <div class="flex flex-wrap items-center gap-3">
    <Avatar name="Broken Image" src="data:image/png;base64,AAAA" />
    <span class="text-xs text-muted-foreground">A failed image falls back to initials.</span>
  </div>

  <div class="grid max-w-xs gap-1.5">
    <Label for="avatar-demo-name">Type a name</Label>
    <div class="flex items-center gap-3">
      <Avatar name={name || '?'} size="lg" />
      <Input id="avatar-demo-name" bind:value={name} />
    </div>
    <p class="text-xs text-muted-foreground">Colors are derived from the name, so they are stable.</p>
  </div>
</div>
