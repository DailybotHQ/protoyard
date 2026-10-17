<script lang="ts">
import { Lock, MessagesSquare, Sparkles } from '@lucide/svelte';
import { can, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, EmptyState } from '@protoyard/ui';
import AuthorAvatar from '../components/AuthorAvatar.svelte';
import type { Agent } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { startWithAgent } from '../lib/actions.ts';
import { authorOf, useChat } from '../lib/context.ts';

/** Desktop landing pane: a welcome for new users, otherwise "pick a conversation". */
const { services, inbox, directory } = useChat();
const principal = usePrincipal();

let starting = $state<string | null>(null);

const agents = $derived([...(directory.current?.agents.values() ?? [])]);
const isNew = $derived(!inbox.loading && (inbox.current ?? []).length === 0);
const firstName = $derived(principal.current?.persona.name.split(' ')[0] ?? 'there');
const canCreate = $derived(can(CAPABILITIES.createConversation));

async function start(agent: Agent) {
  starting = agent.id;
  await startWithAgent(services, agent);
  starting = null;
}
</script>

<div class="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto px-6 py-10">
  {#if isNew}
    <div class="flex max-w-xl flex-col items-center text-center">
      <span class="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary" aria-hidden="true">
        <Sparkles class="size-7" />
      </span>
      <h1 class="mt-5 text-2xl font-semibold tracking-tight">Welcome to Relay, {firstName}</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Relay is where your team and its AI agents work in one thread. Start by asking Atlas anything —
        a summary, a comparison, a quick bit of research.
      </p>
      {#if canCreate}
        {@const atlas = agents.find((a) => a.handle === 'atlas')}
        {#if atlas}
          <Button size="lg" class="mt-6" onclick={() => start(atlas)} loading={starting === atlas.id}>
            <Sparkles aria-hidden="true" /> Ask Atlas
          </Button>
        {/if}
      {:else}
        <p class="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Lock class="size-4" aria-hidden="true" /> Your role can read conversations but not start them.
        </p>
      {/if}
    </div>
  {:else}
    <EmptyState
      icon={MessagesSquare}
      title="Pick a conversation"
      description="Choose a thread on the left, or start a new chat with one of your agents."
    />
  {/if}

  {#if agents.length > 0}
    <section class="mt-8 w-full max-w-2xl" aria-labelledby="agents-heading">
      <h2 id="agents-heading" class="mb-3 text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your agents</h2>
      <ul class="grid gap-3 sm:grid-cols-3">
        {#each agents as agent (agent.id)}
          <li class="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <div class="flex items-center gap-3">
              <AuthorAvatar author={authorOf(directory.current, agent.id)} />
              <div class="min-w-0">
                <p class="font-medium">{agent.name}</p>
                <p class="text-xs text-muted-foreground">@{agent.handle}</p>
              </div>
            </div>
            <p class="flex-1 text-xs text-muted-foreground">{agent.description}</p>
            {#if canCreate}
              <Button variant="outline" size="sm" onclick={() => start(agent)} loading={starting === agent.id}>
                Ask {agent.name}
              </Button>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
