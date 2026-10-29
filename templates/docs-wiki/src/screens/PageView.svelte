<script lang="ts">
import { FilePlus, FileQuestion, History, Pencil, Trash2 } from '@lucide/svelte';
import {
  can,
  Link,
  liveQuery,
  navigate,
  type RouteProps,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import { AlertDialog, Breadcrumb, Button, Card, EmptyState, Skeleton } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import NewPageDialog from '../components/NewPageDialog.svelte';
import PageBody from '../components/PageBody.svelte';
import PageTree from '../components/PageTree.svelte';
import { CAPABILITIES } from '../domain/policy.ts';
import { pageTree } from '../domain/wiki.ts';
import { useWiki } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';

let { params }: RouteProps = $props();
const { db, services } = useWiki();
const clock = useClock();
const id = () => params.id ?? '';

const data = liveQuery(
  async () => {
    const page = await db.pages.get(id());
    if (!page) return null;
    const [space, siblings, people] = await Promise.all([
      db.spaces.get(page.spaceId),
      db.pages.where('spaceId').equals(page.spaceId).toArray(),
      db.table('py_personas').toArray() as Promise<{ id: string; name: string }[]>,
    ]);
    const tree = pageTree(siblings);
    const trail = [];
    for (let at = page.parentId; at; at = tree.byId.get(at)?.parentId ?? null) {
      const p = tree.byId.get(at);
      if (p) trail.unshift(p);
    }
    return {
      page,
      space,
      trail,
      children: tree.children.get(page.id) ?? [],
      editor: people.find((p) => p.id === page.updatedBy)?.name ?? page.updatedBy,
    };
  },
  { initial: undefined, deps: id }
);

let subOpen = $state(false);
let deleteOpen = $state(false);
const canEdit = $derived(can(CAPABILITIES.pagesEdit));

const remove = async () => {
  const page = data.current?.page;
  if (!page) return;
  const r = await runService(() => services.pages.remove(page.id), { success: 'Page deleted' });
  if (r.ok) navigate(`/spaces/${page.spaceId}`);
};
</script>

{#if data.current === undefined}
  <Skeleton class="h-64 w-full" />
{:else if data.current === null}
  <EmptyState icon={FileQuestion} title="Page not found" description="It may have been deleted, or it is not in the loaded scenario.">
    {#snippet action()}<Button href="#/" variant="outline">Home</Button>{/snippet}
  </EmptyState>
{:else}
  {@const { page, space, trail, children, editor } = data.current}
  <div class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
    <Card class="order-2 p-2 lg:order-1"><PageTree spaceId={page.spaceId} currentId={page.id} /></Card>
    <article class="order-1 min-w-0 lg:order-2" aria-labelledby="page-title">
      <Breadcrumb
        items={[
          { label: space ? `${space.icon} ${space.name}` : 'Space', href: `#/spaces/${page.spaceId}` },
          ...trail.map((p) => ({ label: p.title, href: `#/pages/${p.id}` })),
          { label: page.title },
        ]}
      />
      <header class="mt-3 mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <h1 id="page-title" class="text-2xl font-semibold tracking-tight break-words">{page.title}</h1>
          <p class="mt-1 text-sm text-muted-foreground" data-page-meta="">Version {page.version} · edited by {editor} {fromNow(page.updatedAt, clock.now)}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          {#if canEdit}
            <Button href="#/pages/{page.id}/edit"><LucideIcon icon={Pencil} class="size-4" />Edit</Button>
          {/if}
          <Button variant="outline" href="#/pages/{page.id}/history"><LucideIcon icon={History} class="size-4" />History</Button>
          {#if canEdit}
            <Button variant="outline" onclick={() => (subOpen = true)}><LucideIcon icon={FilePlus} class="size-4" />New subpage</Button>
            {#if children.length === 0}
              <Button variant="ghost" onclick={() => (deleteOpen = true)}><LucideIcon icon={Trash2} class="size-4" />Delete</Button>
            {/if}
          {/if}
        </div>
      </header>

      <PageBody source={page.body} />

      {#if children.length > 0}
        <section class="mt-8 border-t border-border pt-4" aria-labelledby="subpages-heading">
          <h2 id="subpages-heading" class="mb-2 text-sm font-semibold text-muted-foreground">Subpages ({children.length})</h2>
          <ul class="grid gap-1 text-sm sm:grid-cols-2">
            {#each children.slice(0, 50) as c (c.id)}
              <li><Link href="/pages/{c.id}" class="hover:underline">{c.title}</Link></li>
            {/each}
          </ul>
          {#if children.length > 50}<p class="mt-2 text-xs text-muted-foreground">And {children.length - 50} more in the page tree.</p>{/if}
        </section>
      {/if}
    </article>
  </div>

  <NewPageDialog bind:open={subOpen} spaceId={page.spaceId} parentId={page.id} parentTitle={page.title} />
  <AlertDialog
    bind:open={deleteOpen}
    title="Delete “{page.title}”?"
    description="The page and its {page.version} versions are deleted. This cannot be undone."
    confirmLabel="Delete page"
    destructive
    onConfirm={remove}
  />
{/if}
