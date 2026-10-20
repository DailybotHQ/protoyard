<script lang="ts">
import { SearchX } from '@lucide/svelte';
import { Link, liveQuery, navigate, type RouteProps } from '@protoyard/renderer-svelte';
import { EmptyState, Select, Skeleton } from '@protoyard/ui';
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
  <label class="grid gap-1 text-xs text-muted-foreground">
    Space
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
  <p class="text-sm text-muted-foreground">Type a word or two, like “deploy” or “time off”.</p>
{:else if hits.length === 0}
  <EmptyState icon={SearchX} title="No pages match “{q}”" description="Try fewer or different words, or all spaces." />
{:else}
  <p class="mb-3 text-sm text-muted-foreground" role="status">{hits.length === 50 ? 'Top 50 results' : `${hits.length} result${hits.length === 1 ? '' : 's'}`} for “{q}”</p>
  <ol class="grid gap-3" aria-label="Search results">
    {#each hits as hit (hit.page.id)}
      <li class="rounded-lg border border-border p-4">
        <Link href="/pages/{hit.page.id}" class="font-medium hover:underline"><Highlighted segments={hit.title} /></Link>
        <p class="text-xs text-muted-foreground">{data.current.names.get(hit.page.spaceId)} · v{hit.page.version}</p>
        <p class="mt-1 text-sm text-muted-foreground"><Highlighted segments={hit.snippet} /></p>
      </li>
    {/each}
  </ol>
{/if}
