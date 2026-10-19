<script lang="ts" generics="E extends FileEntry">
import { Folder, FolderPlus, LayoutGrid, List, Upload } from '@lucide/svelte';
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import {
  AlertDialog,
  Button,
  cn,
  Dialog,
  type DropzoneFile,
  FileDropzone,
  Spinner,
} from '@protoyard/ui';
import {
  breadcrumbs,
  categoryOf,
  childrenOf,
  type FileEntry,
  formatSize,
  moveProblem,
  nameProblem,
  thumbnailUrl,
  uniqueName,
} from '@protoyard/views/files';
import { onDestroy, tick } from 'svelte';
import QueryState from '../states/QueryState.svelte';
import TreeView from '../tree/TreeView.svelte';
import FilePreview from './FilePreview.svelte';

/**
 * A file manager: a folder tree, breadcrumbs, a grid or list of the open
 * folder with multi-select and roving focus, rename, move, delete, new folder
 * and upload through promise callbacks (the prototype's services), and a
 * preview lightbox. Files without a stored blob get a generated thumbnail.
 */
let {
  query,
  folder = $bindable(null),
  view = $bindable('grid'),
  getBlob,
  onCreateFolder,
  onRename,
  onMove,
  onDelete,
  onUpload,
  accept,
  maxSize,
  label = 'Files',
  rootLabel = 'Home',
  onRetry,
  class: className,
}: {
  query: { readonly current: E[] | undefined; readonly loading: boolean; readonly error: unknown };
  /** The open folder id (`null` is the root, bindable). */
  folder?: string | null;
  view?: 'grid' | 'list';
  /** Reads a stored blob (for image thumbnails and previews); shown through object URLs revoked on destroy. */
  getBlob?: (entry: E) => Promise<Blob | undefined>;
  onCreateFolder?: (parentId: string | null, name: string) => unknown;
  onRename?: (entry: E, name: string) => unknown;
  onMove?: (entries: E[], targetId: string | null) => unknown;
  onDelete?: (entries: E[]) => unknown;
  onUpload?: (files: File[], folderId: string | null) => unknown;
  /** Upload limits for the dropzone (`image/*,.pdf`, bytes). */
  accept?: string;
  maxSize?: number;
  label?: string;
  rootLabel?: string;
  onRetry?: () => void | Promise<void>;
  class?: string;
} = $props();

const uid = $props.id();
// Optimistic overlays while a rename or move is saving.
let names = $state<Record<string, string>>({});
let parents = $state<Record<string, string | null>>({});
let pending = $state<Record<string, boolean>>({});
let selected = $state<Set<string>>(new Set());
let anchor = $state<string | null>(null);
let focusId = $state<string | null>(null);
let renaming = $state<{ id: string; draft: string; error: string } | null>(null);
let creating = $state<{ draft: string; error: string } | null>(null);
let multi = $state(false);
let moveOpen = $state(false);
let moveTarget = $state('');
let moveError = $state('');
let deleteOpen = $state(false);
let deleteTargets = $state<E[]>([]);
let uploadOpen = $state(false);
let uploading = $state(0);
let dropped = $state<DropzoneFile[]>([]);
let previewOpen = $state(false);
let previewIndex = $state(0);
let announcement = $state('');
let listEl = $state<HTMLElement>();
let listWidth = $state(0);
let expanded = $state<string[]>([]);
let urls = $state<Record<string, string>>({});
const requested = new Set<string>();

const entries = $derived(
  (query.current ?? []).map((e) => {
    const name = names[e.id];
    const parentId = e.id in parents ? parents[e.id] : undefined;
    return name === undefined && parentId === undefined
      ? e
      : {
          ...e,
          ...(name === undefined ? {} : { name }),
          ...(parentId === undefined ? {} : { parentId }),
        };
  }) as E[]
);
const byId = $derived(new Map(entries.map((e) => [e.id, e])));
const items = $derived(childrenOf(entries, folder));
const files = $derived(items.filter((e) => e.kind === 'file'));
const path = $derived(breadcrumbs(entries, folder));
const folders = $derived(entries.filter((e) => e.kind === 'folder'));
const folderQuery = $derived({
  current: query.current ? folders : undefined,
  loading: query.loading,
  error: query.error,
});
const chosen = $derived(items.filter((e) => selected.has(e.id)));
const columns = $derived(view === 'list' ? 1 : Math.max(1, Math.floor((listWidth || 640) / 152)));
const activeId = $derived(
  focusId && items.some((e) => e.id === focusId) ? focusId : (items[0]?.id ?? null)
);
const folderPaths = $derived(
  folders
    .map((f) => ({
      id: f.id,
      label: [...breadcrumbs(entries, f.id)].map((p) => p.name).join(' / '),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en'))
);

// A folder change clears the selection and opens the tree down to it.
$effect(() => {
  void folder;
  selected = new Set();
  anchor = null;
  focusId = null;
  const ids = path.map((p) => p.id);
  const missing = ids.filter((id) => !expanded.includes(id));
  if (missing.length) expanded = [...expanded, ...missing];
});

// Settled overlays: drop them once the data shows the saved value.
$effect(() => {
  for (const e of query.current ?? []) {
    if (pending[e.id]) continue;
    if (names[e.id] !== undefined && names[e.id] === e.name) names = omit(names, e.id);
    if (e.id in parents && (parents[e.id] ?? null) === (e.parentId ?? null))
      parents = omit(parents, e.id);
  }
});

// Blob thumbnails for images in the open folder (object URLs, revoked on destroy).
$effect(() => {
  if (!getBlob) return;
  for (const e of items) {
    if (e.kind !== 'file' || !e.hasBlob || categoryOf(e) !== 'image' || requested.has(e.id))
      continue;
    requested.add(e.id);
    void getBlob(e)
      .then((blob) => {
        if (blob && !destroyed) urls = { ...urls, [e.id]: URL.createObjectURL(blob) };
      })
      .catch(() => {
        // The generated thumbnail stays.
      });
  }
});
let destroyed = false;
onDestroy(() => {
  destroyed = true;
  for (const url of Object.values(urls)) URL.revokeObjectURL(url);
});

function omit<V>(record: Record<string, V>, key: string): Record<string, V> {
  const { [key]: _drop, ...rest } = record;
  return rest;
}

function announce(text: string) {
  announcement = text;
}

function errorText(error: unknown): string {
  if (isValidationError(error)) return Object.values(error.issues)[0] ?? error.message;
  return error instanceof Error ? error.message : 'Something went wrong';
}

function thumb(e: E): string {
  return urls[e.id] ?? thumbnailUrl(e);
}

// ── navigation and selection ─────────────────────────────────────────────
function openFolder(id: string | null) {
  folder = id;
}

function openEntry(e: E) {
  if (e.kind === 'folder') openFolder(e.id);
  else {
    previewIndex = Math.max(
      0,
      files.findIndex((f) => f.id === e.id)
    );
    previewOpen = true;
  }
}

function selectOnly(id: string) {
  selected = new Set([id]);
  anchor = id;
}

function toggle(id: string) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected = next;
  anchor = id;
}

function selectRange(to: string) {
  const ids = items.map((e) => e.id);
  const a = ids.indexOf(anchor ?? to);
  const b = ids.indexOf(to);
  const [from, end] = a < b ? [a, b] : [b, a];
  selected = new Set(ids.slice(Math.max(0, from), end + 1));
}

function onItemClick(event: MouseEvent, e: E) {
  focusId = e.id;
  if (event.shiftKey) selectRange(e.id);
  else if (multi || event.metaKey || event.ctrlKey) toggle(e.id);
  else selectOnly(e.id);
}

async function focusItem(id: string | undefined) {
  if (!id) return;
  focusId = id;
  await tick();
  listEl?.querySelector<HTMLElement>(`[data-entry="${CSS.escape(id)}"]`)?.focus();
}

function onListKey(event: KeyboardEvent) {
  if (renaming) return;
  const ids = items.map((e) => e.id);
  const at = Math.max(0, ids.indexOf(activeId ?? ''));
  const steps: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: columns,
    ArrowUp: -columns,
    Home: -ids.length,
    End: ids.length,
  };
  const step = steps[event.key];
  if (step !== undefined) {
    event.preventDefault();
    const target = ids[Math.max(0, Math.min(ids.length - 1, at + step))];
    if (!target) return;
    if (event.shiftKey) selectRange(target);
    else if (!(event.ctrlKey || event.metaKey)) selectOnly(target);
    void focusItem(target);
    return;
  }
  const current = activeId ? byId.get(activeId) : undefined;
  if (event.key === ' ' && current) {
    event.preventDefault();
    toggle(current.id);
  } else if (event.key === 'Enter' && current) {
    event.preventDefault();
    openEntry(current);
  } else if (event.key === 'F2' && current && onRename) {
    event.preventDefault();
    startRename(current);
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && onDelete) {
    const targets = chosen.length ? chosen : current ? [current] : [];
    if (targets.length) {
      event.preventDefault();
      askDelete(targets);
    }
  } else if (event.key === 'a' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    selected = new Set(ids);
  } else if (event.key === 'Escape' && selected.size) {
    event.preventDefault();
    selected = new Set();
  } else if (event.key === 'Backspace' && folder !== null) {
    openFolder(path.at(-2)?.id ?? null);
  }
}

// ── writes (all through callbacks, with rollback) ────────────────────────
function startRename(e: E) {
  renaming = { id: e.id, draft: e.name, error: '' };
  void tick().then(() => {
    const input = listEl?.querySelector<HTMLInputElement>('[data-rename]');
    input?.focus();
    // Select the name without its extension.
    const dot = e.kind === 'file' ? e.name.lastIndexOf('.') : -1;
    input?.setSelectionRange(0, dot > 0 ? dot : e.name.length);
  });
}

async function commitRename() {
  const current = renaming;
  if (!current || !onRename) return;
  const entry = byId.get(current.id);
  if (!entry) {
    renaming = null;
    return;
  }
  const name = current.draft.trim();
  if (name === entry.name) {
    renaming = null;
    void focusItem(entry.id);
    return;
  }
  const problem = nameProblem(name, childrenOf(entries, entry.parentId ?? null), entry.id);
  if (problem) {
    renaming = { ...current, error: problem };
    return;
  }
  renaming = null;
  const original = (query.current ?? []).find((e) => e.id === entry.id) ?? entry;
  names = { ...names, [entry.id]: name };
  pending = { ...pending, [entry.id]: true };
  void focusItem(entry.id);
  const result = await runService(() => onRename(original, name));
  pending = omit(pending, entry.id);
  if (result.ok) announce(`Renamed to ${name}.`);
  else {
    names = omit(names, entry.id);
    announce(`Not renamed: ${errorText(result.error)}`);
  }
}

function askDelete(targets: E[]) {
  deleteTargets = targets;
  deleteOpen = true;
}

async function confirmDelete() {
  if (!onDelete) return;
  const targets = deleteTargets;
  await onDelete(targets);
  selected = new Set();
  announce(`Deleted ${targets.length === 1 ? (targets[0] as E).name : `${targets.length} items`}.`);
}

function openMove() {
  moveTarget = '';
  moveError = '';
  moveOpen = true;
}

async function commitMove() {
  if (!onMove) return;
  const targets = chosen;
  const targetId = moveTarget === '' ? null : moveTarget;
  const problem = moveProblem(
    entries,
    targets.map((e) => e.id),
    targetId
  );
  if (problem) {
    moveError = problem;
    return;
  }
  moveOpen = false;
  const originals = targets.map((t) => (query.current ?? []).find((e) => e.id === t.id) ?? t);
  const where = targetId ? (byId.get(targetId)?.name ?? 'the folder') : rootLabel;
  const next = { ...parents };
  const busy = { ...pending };
  for (const t of targets) {
    next[t.id] = targetId;
    busy[t.id] = true;
  }
  parents = next;
  pending = busy;
  selected = new Set();
  const result = await runService(() => onMove(originals, targetId));
  let restored = { ...parents };
  let idle = { ...pending };
  for (const t of targets) {
    idle = omit(idle, t.id);
    if (!result.ok) restored = omit(restored, t.id);
  }
  pending = idle;
  parents = restored;
  if (result.ok)
    announce(
      `Moved ${targets.length === 1 ? (targets[0] as E).name : `${targets.length} items`} to ${where}.`
    );
  else announce(`Not moved: ${errorText(result.error)}`);
}

async function commitCreate() {
  if (!creating || !onCreateFolder) return;
  const name = creating.draft.trim();
  const problem = nameProblem(name, items);
  if (problem) {
    creating = { ...creating, error: problem };
    return;
  }
  const result = await runService(() => onCreateFolder(folder, name), {
    success: 'Folder created',
  });
  if (result.ok) creating = null;
  else if (creating) creating = { ...creating, error: errorText(result.error) };
}

async function upload(list: File[]) {
  if (!onUpload || list.length === 0) return;
  uploading = list.length;
  const result = await runService(() => onUpload(list, folder), {
    success: list.length === 1 ? 'File uploaded' : `${list.length} files uploaded`,
  });
  uploading = 0;
  if (result.ok) {
    dropped = [];
    announce(`Uploaded ${list.length === 1 ? (list[0] as File).name : `${list.length} files`}.`);
  }
}

const toolbarButton = 'h-8';
</script>

{#snippet name(e: E)}
  {#if renaming?.id === e.id}
    <span class="grid w-full gap-1">
      <input
        data-rename
        aria-label={`Rename ${e.name}`}
        aria-invalid={renaming.error ? true : undefined}
        aria-describedby={renaming.error ? `files-${uid}-rename-error` : undefined}
        class="h-7 w-full rounded border border-input bg-background px-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={renaming.draft}
        oninput={(event) => renaming && (renaming = { ...renaming, draft: (event.currentTarget as HTMLInputElement).value, error: '' })}
        onkeydown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            void commitRename();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            renaming = null;
            void focusItem(e.id);
          }
        }}
        onblur={() => void commitRename()}
        onclick={(event) => event.stopPropagation()}
      />
      {#if renaming.error}<span id={`files-${uid}-rename-error`} role="alert" class="text-xs text-destructive">{renaming.error}</span>{/if}
    </span>
  {:else}
    <span class="min-w-0 truncate">{e.name}</span>
    {#if pending[e.id]}<Spinner class="size-3.5 shrink-0" /><span class="sr-only">Saving</span>{/if}
  {/if}
{/snippet}

<div class={cn('grid gap-3 md:grid-cols-[14rem_1fr]', className)}>
  <!-- Folder tree (from md). -->
  <aside class="hidden min-w-0 md:block">
    <Button variant={folder === null ? 'secondary' : 'ghost'} size="sm" class="mb-1 w-full justify-start" aria-current={folder === null ? 'page' : undefined} onclick={() => openFolder(null)}>
      <Folder class="size-4" aria-hidden="true" />{rootLabel}
    </Button>
    <TreeView
      query={folderQuery}
      getId={(f: E) => f.id}
      getParentId={(f: E) => f.parentId ?? null}
      getRank={(f: E) => f.name.toLowerCase()}
      getLabel={(f: E) => f.name}
      bind:expanded
      selected={folder}
      onSelect={(f: E) => openFolder(f.id)}
      label="Folders"
      emptyTitle="No folders yet"
    />
  </aside>

  <section aria-label={label} class="grid min-w-0 content-start gap-3">
    <nav aria-label="Breadcrumb">
      <ol class="flex flex-wrap items-center gap-1 text-sm">
        <li>
          {#if folder === null}
            <span aria-current="page" class="font-medium">{rootLabel}</span>
          {:else}
            <button type="button" class="rounded px-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onclick={() => openFolder(null)}>{rootLabel}</button>
          {/if}
        </li>
        {#each path as crumb, i (crumb.id)}
          <li class="flex items-center gap-1">
            <span aria-hidden="true" class="text-muted-foreground">/</span>
            {#if i === path.length - 1}
              <span aria-current="page" class="font-medium">{crumb.name}</span>
            {:else}
              <button type="button" class="rounded px-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onclick={() => openFolder(crumb.id)}>{crumb.name}</button>
            {/if}
          </li>
        {/each}
      </ol>
    </nav>

    <div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label="File actions">
      {#if onCreateFolder}
        <Button variant="outline" size="sm" class={toolbarButton} onclick={() => (creating = { draft: uniqueName('Untitled folder', items), error: '' })}>
          <FolderPlus class="size-4" aria-hidden="true" />New folder
        </Button>
      {/if}
      {#if onUpload}
        <Button variant="outline" size="sm" class={toolbarButton} aria-expanded={uploadOpen} onclick={() => (uploadOpen = !uploadOpen)}>
          <Upload class="size-4" aria-hidden="true" />Upload
        </Button>
      {/if}
      <Button variant={multi ? 'secondary' : 'ghost'} size="sm" class={toolbarButton} aria-pressed={multi} onclick={() => (multi = !multi)}>Select multiple</Button>
      {#if chosen.length}
        <span class="text-sm text-muted-foreground">{chosen.length} selected</span>
        {#if chosen.length === 1}
          <Button variant="ghost" size="sm" class={toolbarButton} onclick={() => openEntry(chosen[0] as E)}>Open</Button>
          {#if onRename}<Button variant="ghost" size="sm" class={toolbarButton} onclick={() => startRename(chosen[0] as E)}>Rename</Button>{/if}
        {/if}
        {#if onMove}<Button variant="ghost" size="sm" class={toolbarButton} onclick={openMove}>Move to…</Button>{/if}
        {#if onDelete}<Button variant="ghost" size="sm" class={toolbarButton} onclick={() => askDelete(chosen)}>Delete</Button>{/if}
      {/if}
      <span class="ml-auto inline-flex rounded-md border border-border" role="group" aria-label="Layout">
        <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="icon" class="size-8" aria-label="Grid" aria-pressed={view === 'grid'} onclick={() => (view = 'grid')}><LayoutGrid class="size-4" aria-hidden="true" /></Button>
        <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" class="size-8" aria-label="List" aria-pressed={view === 'list'} onclick={() => (view = 'list')}><List class="size-4" aria-hidden="true" /></Button>
      </span>
    </div>

    {#if creating}
      <form
        class="flex flex-wrap items-start gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void commitCreate();
        }}
      >
        <span class="grid gap-1">
          <label for={`files-${uid}-new`} class="sr-only">Folder name</label>
          <input
            id={`files-${uid}-new`}
            class="h-8 w-56 rounded-md border border-input bg-surface px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={creating.draft}
            aria-invalid={creating.error ? true : undefined}
            oninput={(event) => creating && (creating = { draft: (event.currentTarget as HTMLInputElement).value, error: '' })}
            onkeydown={(event) => {
              if (event.key === 'Escape') creating = null;
            }}
          />
          {#if creating.error}<span role="alert" class="text-xs text-destructive">{creating.error}</span>{/if}
        </span>
        <Button type="button" size="sm" class={toolbarButton} onclick={() => commitCreate()}>Create folder</Button>
        <Button type="button" variant="ghost" size="sm" class={toolbarButton} onclick={() => (creating = null)}>Cancel</Button>
      </form>
    {/if}

    {#if uploadOpen && onUpload}
      <FileDropzone bind:files={dropped} {accept} {maxSize} label={`Upload to ${path.at(-1)?.name ?? rootLabel}`} onAdd={(list) => void upload(list)} />
      {#if uploading}<p role="status" class="flex items-center gap-2 text-sm text-muted-foreground"><Spinner class="size-4" />Uploading {uploading === 1 ? '1 file' : `${uploading} files`}…</p>{/if}
    {/if}

    <QueryState {query} label={`Loading ${label.toLowerCase()}`} isEmpty={() => false} {onRetry}>
      {#snippet children()}
        {#if items.length === 0}
          <p class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">This folder is empty.</p>
        {:else}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <ul
            bind:this={listEl}
            bind:clientWidth={listWidth}
            role="listbox"
            aria-label={`${path.at(-1)?.name ?? rootLabel}, ${items.length} items`}
            aria-multiselectable="true"
            tabindex="-1"
            class={cn(view === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3' : 'grid divide-y divide-border rounded-lg border border-border')}
            onkeydown={onListKey}
          >
            {#each items as e (e.id)}
              {@const isSelected = selected.has(e.id)}
              <!-- Keys are handled once on the listbox (roving focus). -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <li
                role="option"
                data-entry={e.id}
                aria-selected={isSelected}
                aria-busy={pending[e.id] || undefined}
                aria-label={renaming?.id === e.id ? undefined : `${e.name}, ${e.kind === 'folder' ? 'folder' : formatSize(e.size) || 'file'}`}
                tabindex={activeId === e.id ? 0 : -1}
                class={cn(
                  'cursor-default outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  view === 'grid' ? 'grid gap-2 rounded-lg border p-2' : 'flex items-center gap-3 px-3 py-2',
                  isSelected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                )}
                onclick={(event) => onItemClick(event, e)}
                ondblclick={() => openEntry(e)}
                onfocus={() => (focusId = e.id)}
              >
                <img src={thumb(e)} alt="" class={cn('rounded object-cover', view === 'grid' ? 'aspect-square w-full' : 'size-8')} loading="lazy" />
                <span class="flex min-w-0 flex-1 items-center gap-1 text-sm">{@render name(e)}</span>
                {#if view === 'list'}
                  <span class="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{e.kind === 'folder' ? '—' : formatSize(e.size)}</span>
                  <span class="hidden w-24 shrink-0 text-xs text-muted-foreground sm:block">{e.updatedAt?.slice(0, 10) ?? ''}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      {/snippet}
    </QueryState>
    <p class="sr-only" aria-live="polite" data-files-live>{announcement}</p>
  </section>
</div>

<FilePreview {files} bind:index={previewIndex} bind:open={previewOpen} urlFor={(e) => urls[e.id]} />

{#if onMove}
  <Dialog bind:open={moveOpen} title={`Move ${chosen.length === 1 ? (chosen[0]?.name ?? '') : `${chosen.length} items`}`} size="sm">
    <div class="grid gap-3">
      <label for={`files-${uid}-target`} class="text-sm font-medium">Destination</label>
      <select
        id={`files-${uid}-target`}
        class="h-9 rounded-md border border-input bg-surface px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={moveTarget}
        onchange={(event) => {
          moveTarget = (event.currentTarget as HTMLSelectElement).value;
          moveError = '';
        }}
      >
        <option value="">{rootLabel}</option>
        {#each folderPaths as option (option.id)}
          <option value={option.id} disabled={moveProblem(entries, chosen.map((c) => c.id), option.id)?.includes('inside itself')}>{option.label}</option>
        {/each}
      </select>
      {#if moveError}<p role="alert" class="text-sm text-destructive">{moveError}</p>{/if}
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onclick={() => (moveOpen = false)}>Cancel</Button>
        <Button size="sm" onclick={() => commitMove()}>Move</Button>
      </div>
    </div>
  </Dialog>
{/if}

{#if onDelete}
  <AlertDialog
    bind:open={deleteOpen}
    title={deleteTargets.length === 1 ? `Delete "${deleteTargets[0]?.name}"?` : `Delete ${deleteTargets.length} items?`}
    description={deleteTargets.some((t) => t.kind === 'folder') ? 'Folders are deleted with everything inside them.' : 'This cannot be undone.'}
    confirmLabel="Delete"
    destructive
    onConfirm={confirmDelete}
  />
{/if}
