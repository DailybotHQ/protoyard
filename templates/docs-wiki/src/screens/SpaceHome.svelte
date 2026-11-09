<script lang="ts">
import { FilePlus, FileQuestion } from '@lucide/svelte';
import { can, liveQuery, type RouteProps, useClock } from '@protoyard/renderer-svelte';
import { Button, Card, EmptyState, Skeleton } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
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
      <Heading level={1} size="xl"><span aria-hidden="true">{s.icon}</span> {s.name}</Heading>
      <Text size="sm" tone="muted" class="mt-1">{s.description}</Text>
    </div>
    {#if can(CAPABILITIES.pagesEdit)}
      <Button onclick={() => (newOpen = true)}><LucideIcon icon={FilePlus} class="size-4" />New page</Button>
    {/if}
  </header>
  <div class="flex flex-col gap-6 lg:flex-row">
    <Card class="p-2 lg:w-2xs lg:shrink-0"><PageTree spaceId={s.id} /></Card>
    <div class="grid min-w-0 content-start gap-6 lg:flex-1">
      <SearchForm />
      <section aria-labelledby="space-recent">
        <Heading level={2} size="lg" id="space-recent" class="mb-3">Recent changes</Heading>
        {#if (recent.current ?? []).length === 0}
          <Text size="sm" tone="muted">No pages yet.</Text>
        {:else}
          <Box border="default" radius="lg" padding="none">
            <ul class="flex flex-col">
              {#each recent.current ?? [] as p, i (p.id)}
                <li>
                  <Box radius="none" padding="none" border={i === 0 ? 'none' : 'block-start'} class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <Button variant="link" href="#/pages/{p.id}" class="h-auto min-h-0 px-0 whitespace-normal">{p.title}</Button>
                    <Text as="span" size="xs" tone="muted">v{p.version} · {fromNow(p.updatedAt, clock.now)}</Text>
                  </Box>
                </li>
              {/each}
            </ul>
          </Box>
        {/if}
      </section>
    </div>
  </div>
  <NewPageDialog bind:open={newOpen} spaceId={s.id} />
{/if}
