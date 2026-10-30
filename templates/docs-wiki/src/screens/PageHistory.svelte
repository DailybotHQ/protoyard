<script lang="ts">
import { ArrowLeft, FileQuestion, RotateCcw } from '@lucide/svelte';
import {
  can,
  isValidationError,
  Link,
  liveQuery,
  type RouteProps,
  runService,
} from '@protoyard/renderer-svelte';
import { Badge, Button, Card, EmptyState, Skeleton } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import PageBody from '../components/PageBody.svelte';
import { CAPABILITIES } from '../domain/policy.ts';
import { lineChanges } from '../domain/wiki.ts';
import { useWiki } from '../lib/context.ts';
import { formatStamp } from '../lib/format.ts';

let { params }: RouteProps = $props();
const { db, services } = useWiki();
const id = () => params.id ?? '';

const data = liveQuery(
  async () => {
    const page = await db.pages.get(id());
    if (!page) return null;
    const [versions, people] = await Promise.all([
      db.versions.where('pageId').equals(id()).toArray(),
      db.table('py_personas').toArray() as Promise<{ id: string; name: string }[]>,
    ]);
    versions.sort((a, b) => b.version - a.version);
    return { page, versions, names: new Map(people.map((p) => [p.id, p.name])) };
  },
  { initial: undefined, deps: id }
);

let picked = $state<number | null>(null);
let error = $state<string | undefined>(undefined);
const shown = $derived.by(() => {
  const d = data.current;
  if (!d) return undefined;
  return d.versions.find((v) => v.version === picked) ?? d.versions[0];
});

const restore = async (version: number) => {
  const r = await runService(() => services.pages.restore(id(), version), {
    success: `Restored version ${version}`,
  });
  if (r.ok) {
    picked = null;
    error = undefined;
  } else if (isValidationError(r.error)) error = r.error.issues.version;
};
</script>

{#if data.current === undefined}
  <Skeleton class="h-64 w-full" />
{:else if data.current === null}
  <EmptyState icon={FileQuestion} title="Page not found" description="It may have been deleted, or it is not in the loaded scenario.">
    {#snippet action()}<Button href="#/" variant="outline">Home</Button>{/snippet}
  </EmptyState>
{:else}
  {@const { page, versions, names } = data.current}
  <Link href="/pages/{page.id}" class="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
    <LucideIcon icon={ArrowLeft} class="size-4" />{page.title}
  </Link>
  <h1 class="mb-1 text-2xl font-semibold tracking-tight">History</h1>
  <p class="mb-6 text-sm text-muted-foreground">{versions.length} versions. Restoring one adds it as a new version, so nothing is ever lost.</p>
  {#if error}<p role="alert" class="mb-4 text-sm text-destructive">{error}</p>{/if}

  <div class="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
    <ol class="grid content-start gap-2" aria-label="Versions">
      {#each versions as v, i (v.id)}
        {@const previous = versions[i + 1]}
        {@const delta = previous ? lineChanges(previous.body, v.body) : null}
        <li>
          <Button
            type="button"
            variant="ghost"
            class="flex w-full flex-col items-stretch justify-start whitespace-normal rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/50 {shown?.id === v.id ? 'border-primary bg-muted/40' : 'border-border'}"
            aria-pressed={shown?.id === v.id}
            onclick={() => (picked = v.version)}
          >
            <span class="flex items-center justify-between gap-2">
              <span class="font-medium">Version {v.version}</span>
              {#if v.version === page.version}<Badge variant="secondary">Current</Badge>{:else}<Badge variant="outline">{v.note}</Badge>{/if}
            </span>
            <span class="mt-1 block text-xs text-muted-foreground">{names.get(v.authorId) ?? v.authorId} · {formatStamp(v.at)}</span>
            {#if delta}<span class="mt-1 block text-xs tabular-nums text-muted-foreground">+{delta.added} −{delta.removed} lines</span>{/if}
          </Button>
        </li>
      {/each}
    </ol>

    {#if shown}
      <Card class="min-w-0 p-4">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h2 class="font-semibold">Version {shown.version}: {shown.title}</h2>
            <p class="text-xs text-muted-foreground">{shown.note} by {names.get(shown.authorId) ?? shown.authorId}, {formatStamp(shown.at)}</p>
          </div>
          {#if can(CAPABILITIES.pagesEdit) && shown.version !== page.version}
            {@const target = shown.version}
            <Button onclick={() => restore(target)}><LucideIcon icon={RotateCcw} class="size-4" />Restore version {target}</Button>
          {/if}
        </div>
        <PageBody source={shown.body} label="Version {shown.version} content" />
      </Card>
    {/if}
  </div>
{/if}
