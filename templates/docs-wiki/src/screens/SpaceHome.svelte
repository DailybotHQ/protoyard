<script lang="ts">
import { FilePlus, FileQuestion } from '@lucide/svelte';
import { can, Link, liveQuery, type RouteProps, useClock } from '@protoyard/renderer-svelte';
import { Button, Card, EmptyState, Skeleton } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import NewPageDialog from '../components/NewPageDialog.svelte';
import PageTree from '../components/PageTree.svelte';
import SearchForm from '../components/SearchForm.svelte';
import { CAPABILITIES } from '../domain/policy.ts';
import { useWiki } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';

let { params }: RouteProps = $props();
const { db } = useWiki();
const clock = useClock();
const id = () => params.id ?? '';
const space = liveQuery(() => db.spaces.get(id()), { deps: id });
const recent = liveQuery(
  async () =>
    (await db.pages.where('spaceId').equals(id()).toArray())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 10),
  { initial: [], deps: id }
);
let newOpen = $state(false);
</script>

{#if space.current === undefined && space.loading}
  <Skeleton class="h-40 w-full" />
{:else if !space.current}
  <EmptyState icon={FileQuestion} title="Space not found" description="This space does not exist in the loaded scenario.">
    {#snippet action()}<Button href="#/" variant="outline">All spaces</Button>{/snippet}
  </EmptyState>
{:else}
  {@const s = space.current}
  <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight"><span aria-hidden="true">{s.icon}</span> {s.name}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{s.description}</p>
    </div>
    {#if can(CAPABILITIES.pagesEdit)}
      <Button onclick={() => (newOpen = true)}><LucideIcon icon={FilePlus} class="size-4" />New page</Button>
    {/if}
  </header>
  <div class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
    <Card class="p-2"><PageTree spaceId={s.id} /></Card>
    <div class="grid content-start gap-6">
      <SearchForm />
      <section aria-labelledby="space-recent">
        <h2 id="space-recent" class="mb-3 text-lg font-semibold">Recent changes</h2>
        {#if (recent.current ?? []).length === 0}
          <p class="text-sm text-muted-foreground">No pages yet.</p>
        {:else}
          <ul class="divide-y divide-border rounded-lg border border-border">
            {#each recent.current ?? [] as p (p.id)}
              <li class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <Link href="/pages/{p.id}" class="font-medium hover:underline">{p.title}</Link>
                <span class="text-xs text-muted-foreground">v{p.version} · {fromNow(p.updatedAt, clock.now)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  </div>
  <NewPageDialog bind:open={newOpen} spaceId={s.id} />
{/if}
