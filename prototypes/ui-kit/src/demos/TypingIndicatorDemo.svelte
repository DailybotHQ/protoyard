<script lang="ts">
import { Checkbox, Switch, TypingIndicator } from '@protoyard/ui';

const people = ['Ana', 'Omar', 'Kai'];
let typing = $state<string[]>(['Ana']);
let showLabel = $state(true);

function toggle(name: string, value: boolean): void {
  typing = value
    ? people.filter((p) => p === name || typing.includes(p))
    : typing.filter((p) => p !== name);
}
</script>

<div class="grid max-w-md gap-5">
  <fieldset class="flex flex-wrap gap-4">
    <legend class="mb-2 text-xs text-muted-foreground">Who is typing?</legend>
    {#each people as name (name)}
      <Checkbox label={name} bind:checked={() => typing.includes(name), (value) => toggle(name, value)} />
    {/each}
  </fieldset>
  <Switch label="Show the label visually" bind:checked={showLabel} />
  <div class="rounded-lg border border-border bg-surface p-3">
    <TypingIndicator names={typing} {showLabel} />
    {#if typing.length === 0}<p class="text-xs text-muted-foreground">Nobody is typing (renders nothing).</p>{/if}
  </div>
  <p class="text-xs text-muted-foreground">
    One, two or several names. The dots stop animating with reduced motion.
  </p>
</div>
