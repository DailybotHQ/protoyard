<script lang="ts">
import { ArrowLeft, FileQuestion, RotateCcw } from '@lucide/svelte';
import {
  can,
  isValidationError,
  liveQuery,
  type RouteProps,
  runService,
} from '@protoyard/renderer-svelte';
import { Badge, Button, Card, EmptyState, Skeleton } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
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
  <Button variant="link" href="#/pages/{page.id}" class="h-auto min-h-0 px-0 mb-4 whitespace-normal">
    <LucideIcon icon={ArrowLeft} class="size-4" />{page.title}
  </Button>
  <Heading level={1} size="xl" class="mb-1">History</Heading>
  <Text size="sm" tone="muted" class="mb-6">{versions.length} versions. Restoring one adds it as a new version, so nothing is ever lost.</Text>
  {#if error}<Text role="alert" size="sm" tone="destructive" class="mb-4">{error}</Text>{/if}

  <div class="flex flex-col gap-6 lg:flex-row">
    <ol class="grid content-start gap-2 lg:w-xs lg:shrink-0" aria-label="Versions">
      {#each versions as v, i (v.id)}
        {@const previous = versions[i + 1]}
        {@const delta = previous ? lineChanges(previous.body, v.body) : null}
        <li>
          <Button
            type="button"
            variant={shown?.id === v.id ? 'secondary' : 'outline'}
            class="flex h-auto w-full flex-col items-stretch justify-start gap-0 whitespace-normal p-3 text-left"
            aria-pressed={shown?.id === v.id}
            onclick={() => (picked = v.version)}
          >
            <span class="flex items-center justify-between gap-2">
              <Text as="span" size="sm" weight="medium">Version {v.version}</Text>
              {#if v.version === page.version}<Badge variant="secondary">Current</Badge>{:else}<Badge variant="outline">{v.note}</Badge>{/if}
            </span>
            <Text as="span" size="xs" tone="muted" class="mt-1 block">{names.get(v.authorId) ?? v.authorId} · {formatStamp(v.at)}</Text>
            {#if delta}<Text as="span" size="xs" tone="muted" tabular class="mt-1 block">+{delta.added} −{delta.removed} lines</Text>{/if}
          </Button>
        </li>
      {/each}
    </ol>

    {#if shown}
      <Card class="min-w-0 p-4 lg:flex-1">
        <Box radius="none" padding="none" border="block-end" class="mb-4 flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <Heading level={2} size="sm">Version {shown.version}: {shown.title}</Heading>
            <Text size="xs" tone="muted">{shown.note} by {names.get(shown.authorId) ?? shown.authorId}, {formatStamp(shown.at)}</Text>
          </div>
          {#if can(CAPABILITIES.pagesEdit) && shown.version !== page.version}
            {@const target = shown.version}
            <Button onclick={() => restore(target)}><LucideIcon icon={RotateCcw} class="size-4" />Restore version {target}</Button>
          {/if}
        </Box>
        <PageBody source={shown.body} label="Version {shown.version} content" />
      </Card>
    {/if}
  </div>
{/if}
