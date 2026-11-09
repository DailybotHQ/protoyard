<script lang="ts">
import { BookOpen, FolderPlus } from '@lucide/svelte';
import {
  can,
  isValidationError,
  liveQuery,
  navigate,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import { Button, Card, Dialog, EmptyState, FormField, Input, Skeleton } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
import PageHeader from '../components/PageHeader.svelte';
import SearchForm from '../components/SearchForm.svelte';
import { CAPABILITIES } from '../domain/policy.ts';
import { useWiki } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';

const { db, services } = useWiki();
const clock = useClock();

const data = liveQuery(
  async () => {
    const [spaces, recent, pages] = await Promise.all([
      db.spaces.orderBy('key').toArray(),
      db.pages.orderBy('updatedAt').reverse().limit(8).toArray(),
      db.pages.toArray(),
    ]);
    const counts = new Map<string, number>();
    for (const p of pages) counts.set(p.spaceId, (counts.get(p.spaceId) ?? 0) + 1);
    return {
      spaces,
      recent,
      counts,
      names: new Map(spaces.map((s) => [s.id, `${s.icon} ${s.name}`])),
    };
  },
  { initial: undefined }
);

let spaceOpen = $state(false);
let form = $state({ name: '', key: '', description: '' });
let errors = $state<Record<string, string>>({});
let saving = $state(false);
async function createSpace(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(() => services.spaces.create(form), { success: 'Space created' });
  saving = false;
  if (result.ok) {
    spaceOpen = false;
    navigate(`/spaces/${result.value.id}`);
  } else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<PageHeader title="Wiki" description="Spaces, pages and their history. Everything here is fictional and lives in your browser.">
  {#snippet actions()}
    {#if can(CAPABILITIES.spacesManage)}
      <Button
        onclick={() => {
          form = { name: '', key: '', description: '' };
          errors = {};
          spaceOpen = true;
        }}><LucideIcon icon={FolderPlus} class="size-4" />New space</Button
      >
    {/if}
  {/snippet}
</PageHeader>

<div class="mb-8"><SearchForm /></div>

{#if data.current === undefined}
  <div class="grid gap-4 sm:grid-cols-3" aria-busy="true" aria-label="Loading spaces">
    {#each [0, 1, 2] as i (i)}<Skeleton class="h-28" />{/each}
  </div>
{:else if data.current.spaces.length === 0}
  <EmptyState
    icon={BookOpen}
    title="No spaces yet"
    description={can(CAPABILITIES.spacesManage) ? 'Create the first space; it starts with an Overview page.' : 'An owner has not created any space yet.'}
  />
{:else}
  <section aria-labelledby="spaces-heading" class="mb-8">
    <Heading level={2} size="lg" id="spaces-heading" class="mb-3">Spaces</Heading>
    <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.current.spaces as s (s.id)}
        <li>
          <Card href="#/spaces/{s.id}" linkLabel={s.name} class="h-full p-4">
            <Text size="figure" aria-hidden="true">{s.icon}</Text>
            <Heading level={3} size="sm" class="mt-2">{s.name}</Heading>
            <Text size="sm" tone="muted" class="mt-1">{s.description}</Text>
            <Text size="xs" tone="muted" class="mt-3"><Text as="span" size="xs" tone="muted" mono>{s.key}</Text> · {data.current.counts.get(s.id) ?? 0} pages</Text>
          </Card>
        </li>
      {/each}
    </ul>
  </section>

  <section aria-labelledby="recent-heading">
    <Heading level={2} size="lg" id="recent-heading" class="mb-3">Recently updated</Heading>
    <Box border="default" radius="lg" padding="none">
      <ul class="flex flex-col">
        {#each data.current.recent as p, i (p.id)}
          <li>
            <Box radius="none" padding="none" border={i === 0 ? 'none' : 'block-start'} class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span class="min-w-0">
                <Button variant="link" href="#/pages/{p.id}" class="h-auto min-h-0 px-0 whitespace-normal">{p.title}</Button>
                <Text as="span" size="sm" tone="muted"> · {data.current.names.get(p.spaceId)}</Text>
              </span>
              <Text as="span" size="xs" tone="muted">v{p.version} · {fromNow(p.updatedAt, clock.now)}</Text>
            </Box>
          </li>
        {/each}
      </ul>
    </Box>
  </section>
{/if}

<Dialog bind:open={spaceOpen} title="New space" description="A space holds a tree of pages. It starts with an Overview page.">
  <form id="space-form" class="grid gap-4" onsubmit={createSpace} novalidate>
    <FormField label="Name" required error={errors.name}>
      {#snippet children(control)}<Input {...control.props} bind:value={form.name} maxlength={60} autocomplete="off" placeholder="Design" />{/snippet}
    </FormField>
    <FormField label="Key" required error={errors.key} description="2–10 letters or digits, like DES.">
      {#snippet children(control)}<Input {...control.props} bind:value={form.key} maxlength={10} autocomplete="off" placeholder="DES" />{/snippet}
    </FormField>
    <FormField label="Description" error={errors.description}>
      {#snippet children(control)}<Input {...control.props} bind:value={form.description} maxlength={200} autocomplete="off" />{/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (spaceOpen = false)}>Cancel</Button>
    <Button type="submit" form="space-form" loading={saving}>Create space</Button>
  {/snippet}
</Dialog>
