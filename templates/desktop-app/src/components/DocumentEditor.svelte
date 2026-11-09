<script lang="ts">
import { Pin, PinOff, Save, Trash2 } from '@lucide/svelte';
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Input, Select, Textarea } from '@protoyard/ui';
import { Chip } from 'texuli/badge';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
import type { Document, Folder, Tag } from '../database/schema.ts';
import { DOCUMENT_BODY_MAX, DOCUMENT_TITLE_MAX } from '../domain/validation.ts';
import { useDesktop } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';

/**
 * The document pane. Edits stay local until Save (⌘/Ctrl+S or the button);
 * `dirty` tells the workspace to confirm before anything would discard them.
 * Mount it keyed by document id so each document starts from its saved text.
 */
let {
  document: doc,
  folders,
  tags,
  canEdit,
  canDelete,
  now,
  authorName,
  dirty = $bindable(false),
  onclose,
  ondelete,
}: {
  document: Document;
  folders: Folder[];
  tags: Tag[];
  canEdit: boolean;
  canDelete: boolean;
  now: Date;
  authorName: (personaId: string) => string;
  dirty?: boolean;
  onclose: () => void;
  ondelete: () => void;
} = $props();

const { services } = useDesktop();

// svelte-ignore state_referenced_locally
let title = $state(doc.title);
// svelte-ignore state_referenced_locally
let body = $state(doc.body);
// svelte-ignore state_referenced_locally
let tagIds = $state<string[]>([...doc.tagIds]);
let errors = $state<Record<string, string>>({});
let saving = $state(false);
let newTag = $state('');
let tagError = $state('');

const sameTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

$effect(() => {
  dirty = title !== doc.title || body !== doc.body || !sameTags(tagIds, doc.tagIds);
});

/** Saves the local edits. Exposed so the menu bar and ⌘/Ctrl+S can call it. */
export async function save(): Promise<void> {
  if (!canEdit || saving) return;
  saving = true;
  const result = await runService(
    () => services.documents.save(doc.id, { title, body, tagIds: $state.snapshot(tagIds) }),
    { success: 'Saved' }
  );
  saving = false;
  if (result.ok) {
    errors = {};
    title = result.value.title;
  } else if (isValidationError(result.error)) {
    errors = result.error.issues;
  }
}

function toggleTag(id: string) {
  tagIds = tagIds.includes(id) ? tagIds.filter((t) => t !== id) : [...tagIds, id];
}

async function addTag(event: SubmitEvent) {
  event.preventDefault();
  tagError = '';
  const result = await runService(() => services.tags.create({ name: newTag }), {
    success: 'Tag created',
  });
  if (result.ok) {
    newTag = '';
    tagIds = [...tagIds, result.value.id];
  } else if (isValidationError(result.error)) {
    tagError = result.error.issues.name ?? result.error.message;
  }
}

async function move(folderId: string) {
  if (folderId === doc.folderId) return;
  await runService(() => services.documents.move(doc.id, folderId), { success: 'Moved' });
}

async function togglePin() {
  await runService(() => services.documents.setPinned(doc.id, !doc.pinned), {
    success: doc.pinned ? 'Unpinned' : 'Pinned',
  });
}

const status = $derived(
  saving
    ? 'Saving…'
    : dirty
      ? 'Unsaved changes'
      : `Saved · edited ${fromNow(doc.updatedAt, now)} by ${authorName(doc.updatedBy)}`
);
</script>

<article class="flex min-h-0 flex-1 flex-col" aria-label={`Document: ${doc.title}`}>
  <Box as="header" border="block-end" radius="none" padding="none" class="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2">
    <Text size="xs" tone="muted" truncate class="min-w-0 flex-1" aria-live="polite" data-testid="save-status">
      {canEdit ? status : 'Read-only: your role can view documents but not change them.'}
    </Text>
    {#if canEdit}
      <div class="w-40">
        <Select
          aria-label="Folder"
          items={folders.map((f) => ({ value: f.id, label: f.name }))}
          value={doc.folderId}
          onValueChange={(value: string) => void move(value)}
        />
      </div>
      <Button variant="ghost" size="icon" aria-label={doc.pinned ? 'Unpin document' : 'Pin document'} aria-pressed={doc.pinned} onclick={togglePin}>
        {#if doc.pinned}<LucideIcon icon={PinOff} />{:else}<LucideIcon icon={Pin} />{/if}
      </Button>
    {/if}
    {#if canDelete}
      <Button variant="ghost" size="icon" aria-label="Delete document" onclick={ondelete}>
        <LucideIcon icon={Trash2} />
      </Button>
    {/if}
    {#if canEdit}
      <Button size="sm" onclick={save} loading={saving} disabled={!dirty}>
        <LucideIcon icon={Save} /> Save
      </Button>
    {/if}
    <Button variant="ghost" size="icon" aria-label="Close document" onclick={onclose}>
      <Icon icon="close" aria-hidden="true" />
    </Button>
  </Box>

  <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
    <div>
      <label class="sr-only" for="doc-title">Title</label>
      <Input
        id="doc-title"
        class="w-full"
        bind:value={title}
        readonly={!canEdit}
        maxlength={DOCUMENT_TITLE_MAX}
        placeholder="Untitled"
        aria-invalid={errors.title ? 'true' : undefined}
        aria-describedby={errors.title ? 'doc-title-error' : undefined}
      />
      {#if errors.title}<Text id="doc-title-error" size="xs" tone="destructive" class="mt-1">{errors.title}</Text>{/if}
    </div>

    <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tags">
      {#each tags as tag (tag.id)}
        <Chip
          label={`#${tag.name}`}
          selected={tagIds.includes(tag.id)}
          disabled={!canEdit}
          onclick={() => toggleTag(tag.id)}
        />
      {/each}
      {#if canEdit}
        <form class="flex items-center gap-1" onsubmit={addTag} novalidate>
          <Input class="h-7 w-28" bind:value={newTag} placeholder="New tag" aria-label="New tag name" maxlength={24} aria-invalid={tagError ? 'true' : undefined} />
          <Button type="submit" variant="ghost" size="sm" aria-label="Add tag" disabled={!newTag.trim()}>
            <Icon icon="plus" aria-hidden="true" />
          </Button>
        </form>
      {/if}
    </div>
    {#if tagError || errors.tagIds}<Text size="xs" tone="destructive">{tagError || errors.tagIds}</Text>{/if}

    <label class="sr-only" for="doc-body">Body</label>
    <Textarea
      id="doc-body"
      class="min-h-64 flex-1"
      bind:value={body}
      readonly={!canEdit}
      maxlength={DOCUMENT_BODY_MAX}
      placeholder="Start writing…"
    />
    {#if errors.body}<Text size="xs" tone="destructive">{errors.body}</Text>{/if}
  </div>
</article>
