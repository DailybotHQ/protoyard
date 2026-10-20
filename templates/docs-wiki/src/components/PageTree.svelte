<script lang="ts">
import { can, liveQuery, navigate, runService } from '@protoyard/renderer-svelte';
import type { TreeMove } from '@protoyard/views/tree';
import { TreeView } from '@protoyard/views-ui/tree';
import type { Page } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { pageTree } from '../domain/wiki.ts';
import { useWiki } from '../lib/context.ts';

/**
 * One space's pages as an ARIA tree (`@protoyard/views-ui/tree`): arrows and
 * typeahead to browse, Enter to open; editors drag or use "Move to…", which
 * goes through `pages.move` and rolls back when the service refuses.
 */
let { spaceId, currentId = null }: { spaceId: string; currentId?: string | null } = $props();

const { db, services } = useWiki();
const pages = liveQuery(() => db.pages.where('spaceId').equals(spaceId).toArray(), {
  initial: undefined,
  deps: () => spaceId,
});

let expanded = $state<string[]>([]);
let selected = $state<string | null>(null);
let openedFor = $state<string | null>(null);
// Open the ancestors of the current page once per page, so it is visible; the reader can collapse them later.
$effect(() => {
  const rows = pages.current;
  if (!rows || openedFor === currentId) return;
  openedFor = currentId;
  selected = currentId;
  if (!currentId) return;
  const tree = pageTree(rows);
  const ancestors: string[] = [];
  for (
    let at = tree.byId.get(currentId)?.parentId ?? null;
    at;
    at = tree.byId.get(at)?.parentId ?? null
  ) {
    ancestors.push(at);
  }
  expanded = [...new Set([...expanded, ...ancestors])];
});

const move = (m: TreeMove) =>
  runService(
    () => services.pages.move(m.id, { parentId: m.parentId, rank: m.rank, rerank: m.rerank }),
    {
      success: 'Page moved',
    }
  ).then((r) => {
    if (!r.ok) throw r.error;
  });
</script>

<TreeView
  query={pages}
  getId={(p: Page) => p.id}
  getParentId={(p: Page) => p.parentId}
  getRank={(p: Page) => p.rank}
  getLabel={(p: Page) => p.title}
  bind:expanded
  bind:selected
  onSelect={(p: Page) => navigate(`/pages/${p.id}`)}
  onMove={can(CAPABILITIES.pagesEdit) ? move : undefined}
  label="Pages"
  emptyTitle="No pages in this space yet"
  height="60vh"
/>
