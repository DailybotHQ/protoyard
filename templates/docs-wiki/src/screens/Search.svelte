<script lang="ts">
import { SearchX } from '@lucide/svelte';
import { liveQuery, navigate, type RouteProps } from '@protoyard/renderer-svelte';
import { Button, EmptyState, Select, Skeleton } from '@protoyard/ui';
import { Box, Text } from 'texuli/typography';
import Highlighted from '../components/Highlighted.svelte';
import PageHeader from '../components/PageHeader.svelte';
import SearchForm from '../components/SearchForm.svelte';
import { searchPages } from '../domain/wiki.ts';
import { useWiki } from '../lib/context.ts';

/** Full-text search over every page (in memory; fine for thousands of pages). The query lives in the URL. */
let { query }: RouteProps = $props();
const { db } = useWiki();
const q = $derived(query.get('q') ?? '');
const spaceId = $derived(query.get('space') ?? 'all');

const data = liveQuery(
  async () => {
    const [pages, spaces] = await Promise.all([
      db.pages.toArray(),
      db.spaces.orderBy('key').toArray(),
    ]);
    return { pages, spaces, names: new Map(spaces.map((s) => [s.id, `${s.icon} ${s.name}`])) };
  },
  { initial: undefined }
);
const hits = $derived(
  data.current
    ? searchPages(data.current.pages, q, {
        spaceId: spaceId === 'all' ? undefined : spaceId,
        limit: 50,
      })
    : []
);
const setSpace = (value: string) =>
  navigate(`/search?q=${encodeURIComponent(q)}${value === 'all' ? '' : `&space=${value}`}`, {
    replace: true,
  });
</script>

<PageHeader title="Search" description="Every word must appear in the title or the text. Title matches rank first." />
<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
  <SearchForm value={q} autofocus={!q} />
  <label class="grid gap-1">
    <Text as="span" size="xs" tone="muted">Space</Text>
    <Select
      aria-label="Space"
      items={[{ value: 'all', label: 'All spaces' }, ...(data.current?.spaces ?? []).map((s) => ({ value: s.id, label: s.name }))]}
      value={spaceId}
      onValueChange={setSpace}
    />
  </label>
</div>

{#if data.current === undefined}
  <Skeleton class="h-40 w-full" />
{:else if !q.trim()}
  <Text size="sm" tone="muted">Type a word or two, like “deploy” or “time off”.</Text>
{:else if hits.length === 0}
  <EmptyState icon={SearchX} title="No pages match “{q}”" description="Try fewer or different words, or all spaces." />
{:else}
  <Text size="sm" tone="muted" class="mb-3" role="status">{hits.length === 50 ? 'Top 50 results' : `${hits.length} result${hits.length === 1 ? '' : 's'}`} for “{q}”</Text>
  <ol class="grid gap-3" aria-label="Search results">
    {#each hits as hit (hit.page.id)}
      <li>
        <Box border="default" radius="lg" padding="md">
          <Button variant="link" href="#/pages/{hit.page.id}" class="h-auto min-h-0 px-0 whitespace-normal"><Highlighted segments={hit.title} /></Button>
          <Text size="xs" tone="muted">{data.current.names.get(hit.page.spaceId)} · v{hit.page.version}</Text>
          <Text size="sm" tone="muted" class="mt-1"><Highlighted segments={hit.snippet} /></Text>
        </Box>
      </li>
    {/each}
  </ol>
{/if}
