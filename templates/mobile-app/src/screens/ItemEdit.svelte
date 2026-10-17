<script lang="ts">
import { Lock } from '@lucide/svelte';
import {
  can,
  isValidationError,
  liveQuery,
  navigate,
  type RouteProps,
  runService,
} from '@protoyard/renderer-svelte';
import { Button, EmptyState, FormField, Input, Skeleton, Textarea } from '@protoyard/ui';
import Page from '../components/Page.svelte';
import Segmented from '../components/Segmented.svelte';
import type { ItemStatus } from '../database/schema.ts';
import type { ItemInput } from '../domain/items.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useApp } from '../lib/context.ts';

/** One screen for both routes: `/items/new` (no id) and `/items/:id/edit`. */
let { params }: RouteProps = $props();

const { db, items } = useApp();
const id = $derived(params.id ?? null);
const existing = liveQuery(() => (id ? db.items.get(id) : undefined));

let form = $state<ItemInput>({ title: '', notes: '', status: 'todo' });
let errors = $state<Partial<Record<keyof ItemInput, string>>>({});
let saving = $state(false);
let loaded = false;

// Fill the form once from the stored item; later live updates must not clobber typing.
$effect(() => {
  if (!loaded && existing.current) {
    loaded = true;
    form = {
      title: existing.current.title,
      notes: existing.current.notes,
      status: existing.current.status,
    };
  }
});

const allowed = $derived(can(id ? CAPABILITIES.update : CAPABILITIES.create));
const backHref = $derived(id ? `#/items/${id}` : '#/');

async function save(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  errors = {};
  const result = await runService(
    async () => {
      if (id) {
        await items.update(id, form);
        return id;
      }
      return (await items.create(form)).id;
    },
    { success: id ? 'Changes saved' : 'Item created' }
  );
  saving = false;
  if (result.ok) navigate(`/items/${result.value}`, { replace: true });
  else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<Page title={id ? 'Edit item' : 'New item'} {backHref}>
  {#if !allowed}
    <EmptyState icon={Lock} title="Read-only access" description="Only the owner can create or edit items.">
      {#snippet action()}<Button href={backHref} variant="outline">Go back</Button>{/snippet}
    </EmptyState>
  {:else if id && existing.loading}
    <Skeleton class="h-64 rounded-2xl" />
  {:else if id && !existing.current}
    <EmptyState title="Item not found" description="It may have been deleted.">
      {#snippet action()}<Button href="#/" variant="outline">Back to items</Button>{/snippet}
    </EmptyState>
  {:else}
    <form class="flex flex-col gap-4" onsubmit={save} novalidate>
      <FormField label="Title" error={errors.title} required>
        {#snippet children({ props })}
          <Input {...props} bind:value={form.title} maxlength={80} autocomplete="off" />
        {/snippet}
      </FormField>
      <FormField label="Notes" description="Optional." error={errors.notes}>
        {#snippet children({ props })}
          <Textarea {...props} bind:value={form.notes} rows={5} maxlength={2000} />
        {/snippet}
      </FormField>
      <Segmented
        label="Status"
        bind:value={form.status as ItemStatus}
        options={[
          { value: 'todo', label: 'To do' },
          { value: 'doing', label: 'In progress' },
          { value: 'done', label: 'Done' },
        ]}
      />
      <Button type="submit" size="lg" loading={saving} loadingLabel="Saving…">
        {id ? 'Save changes' : 'Create item'}
      </Button>
    </form>
  {/if}
</Page>
