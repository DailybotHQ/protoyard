<script lang="ts">
import { navigate, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, Checkbox, Dialog, FormField, Input } from '@protoyard/ui';
import type { Conversation } from '../database/schema.ts';
import { useChat } from '../lib/context.ts';

let { open = $bindable(false) }: { open?: boolean } = $props();

const { services, directory } = useChat();
const principal = usePrincipal();

let title = $state('');
let agentIds = $state<string[]>([]);
let memberIds = $state<string[]>([]);
let titleError = $state<string | undefined>();
let saving = $state(false);

const agents = $derived([...(directory.current?.agents.values() ?? [])]);
const teammates = $derived(
  [...(directory.current?.people.values() ?? [])]
    .filter((p) => p.id !== principal.current?.persona.id)
    .sort((a, b) => a.name.localeCompare(b.name))
);

$effect(() => {
  if (open) {
    title = '';
    agentIds = ['agent_atlas'];
    memberIds = [];
    titleError = undefined;
  }
});

function toggle(list: string[], id: string, on: boolean): string[] {
  return on ? [...new Set([...list, id])] : list.filter((x) => x !== id);
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  titleError =
    title.trim().length < 2 ? 'Give the conversation a name (2+ characters).' : undefined;
  if (titleError) return;
  saving = true;
  const result = await runService<Conversation>(
    () => services.createConversation({ title, agentIds, memberIds }),
    { success: 'Conversation created', errorTitle: 'Could not create the conversation' }
  );
  saving = false;
  if (result.ok) {
    open = false;
    navigate(`/c/${result.value.id}`);
  }
}
</script>

<Dialog bind:open title="New conversation" description="Pick the agents and teammates to include." size="lg">
  <form id="new-conversation" class="flex flex-col gap-5" onsubmit={submit} novalidate>
    <FormField label="Name" required error={titleError}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={title} maxlength={60} placeholder="e.g. Launch planning" autocomplete="off" />
      {/snippet}
    </FormField>

    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 text-sm font-medium">Agents</legend>
      {#each agents as agent (agent.id)}
        <Checkbox
          label={`${agent.name} (@${agent.handle})`}
          description={agent.description}
          checked={agentIds.includes(agent.id)}
          onCheckedChange={(on) => (agentIds = toggle(agentIds, agent.id, on))}
        />
      {/each}
      <p class="text-xs text-muted-foreground">
        With one agent it answers every message; with several, @mention the one you want.
      </p>
    </fieldset>

    {#if teammates.length > 0}
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium">Teammates <span class="font-normal text-muted-foreground">(optional)</span></legend>
        <div class="grid gap-2 sm:grid-cols-2">
          {#each teammates as person (person.id)}
            <Checkbox
              label={person.name}
              description={person.title}
              checked={memberIds.includes(person.id)}
              onCheckedChange={(on) => (memberIds = toggle(memberIds, person.id, on))}
            />
          {/each}
        </div>
      </fieldset>
    {/if}
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="new-conversation" loading={saving}>Create conversation</Button>
  {/snippet}
</Dialog>
