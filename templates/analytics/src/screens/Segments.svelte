<script lang="ts">
import { PencilLine, Trash2 } from '@lucide/svelte';
import { describeFilter } from '@protoyard/analytics-ui/filters';
import { can, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { AlertDialog, Button, Card, EmptyState } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import RenameDialog from '../components/RenameDialog.svelte';
import type { SavedSegment } from '../database/schema.ts';
import { EVENT_PROPERTIES } from '../domain/catalog.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useAnalytics } from '../lib/context.ts';
import { formatDate } from '../lib/format.ts';

const { db, services } = useAnalytics();
const principal = usePrincipal();
const segments = liveQuery(() => db.segments.orderBy('name').toArray(), { initial: undefined });
const people = liveQuery(
  async () =>
    new Map(
      (await db.table('py_personas').toArray()).map((p) => [p.id as string, p.name as string])
    ),
  { initial: new Map<string, string>() }
);

let renaming = $state<SavedSegment | null>(null);
let renameOpen = $state(false);
let deleting = $state<SavedSegment | null>(null);
let deleteOpen = $state(false);

// Mirrors the service rule (the service enforces it either way).
const canManage = (segment: SavedSegment) =>
  can(CAPABILITIES.segmentsManageAll) ||
  (can(CAPABILITIES.segmentsManageOwn) && segment.ownerId === principal.current?.persona.id);
</script>

<PageHeader title="Segments" description="Saved filters you can apply on Trends. Save new ones from the Trends filter panel." />

{#if segments.current && segments.current.length === 0}
  <EmptyState title="No saved segments" description="Build a filter on Trends and save it as a segment to reuse it here and on every chart." />
{:else}
  <Card class="p-0">
    <ul class="divide-y divide-border" aria-busy={segments.current === undefined}>
      {#each segments.current ?? [] as segment (segment.id)}
        <li class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div class="min-w-0">
            <p class="font-medium">{segment.name}</p>
            <p class="text-sm text-muted-foreground">{describeFilter(segment.filter, EVENT_PROPERTIES)}</p>
            <p class="text-xs text-muted-foreground">By {people.current?.get(segment.ownerId) ?? 'someone'} · updated {formatDate(segment.updatedAt)}</p>
          </div>
          {#if canManage(segment)}
            <div class="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onclick={() => {
                  renaming = segment;
                  renameOpen = true;
                }}><PencilLine class="size-4" aria-hidden="true" />Rename<span class="sr-only"> {segment.name}</span></Button
              >
              <Button
                variant="ghost"
                size="sm"
                onclick={() => {
                  deleting = segment;
                  deleteOpen = true;
                }}><Trash2 class="size-4" aria-hidden="true" />Delete<span class="sr-only"> {segment.name}</span></Button
              >
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </Card>
{/if}

{#if renaming}
  {@const target = renaming}
  <RenameDialog bind:open={renameOpen} title="Rename segment" current={target.name} save={(name) => services.segments.rename(target.id, { name })} />
{/if}
{#if deleting}
  {@const target = deleting}
  <AlertDialog
    bind:open={deleteOpen}
    destructive
    title={`Delete ${target.name}?`}
    description="Charts using it fall back to all events. Restore a snapshot from DevTools to undo."
    confirmLabel="Delete segment"
    onConfirm={async () => {
      await runService(() => services.segments.remove(target.id), { success: 'Segment deleted' });
    }}
  />
{/if}
