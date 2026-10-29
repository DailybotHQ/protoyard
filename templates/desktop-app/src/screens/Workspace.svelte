<script lang="ts">
import { FilePlus, PanelLeft, Search } from '@lucide/svelte';
import {
  avatarImage,
  can,
  isValidationError,
  liveQuery,
  navigate,
  type RouteProps,
  runService,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { AlertDialog, Avatar, Button, EmptyState, Input, toast } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import DocumentEditor from '../components/DocumentEditor.svelte';
import DocumentList from '../components/DocumentList.svelte';
import FolderDialog from '../components/FolderDialog.svelte';
import FolderNav from '../components/FolderNav.svelte';
import MenuBar, { type Menu } from '../components/MenuBar.svelte';
import ShortcutsDialog from '../components/ShortcutsDialog.svelte';
import { CAPABILITIES, ROLE_LABELS } from '../domain/policy.ts';
import { matchesQuery, sortDocuments } from '../domain/services.ts';
import { useDesktop } from '../lib/context.ts';
import { countLabel } from '../lib/format.ts';
import {
  isMacPlatform,
  isTypingTarget,
  type ShortcutId,
  shortcutFor,
  shortcutLabel,
} from '../lib/shortcuts.ts';

/**
 * The whole desktop workspace: menu bar, folders sidebar, document list,
 * editor and status bar. The route picks the scope (`/`, `/folders/:folderId`,
 * `/tags/:tagId`) and `?doc=<id>` the open document, so every view has a URL.
 */
let { params, query }: RouteProps = $props();
const { db, runtime, services } = useDesktop();
const clock = useClock();
const principal = usePrincipal();
const mac = isMacPlatform();

const folderId = $derived(params.folderId ?? null);
const tagId = $derived(params.tagId ?? null);
const docId = $derived(query.get('doc'));
const scopePath = $derived(folderId ? `/folders/${folderId}` : tagId ? `/tags/${tagId}` : '/');

const folders = liveQuery(() => db.folders.orderBy('createdAt').toArray(), { initial: [] });
const tags = liveQuery(() => db.tags.orderBy('name').toArray(), { initial: [] });
const allDocuments = liveQuery(() => db.documents.toArray(), { initial: [] });
const scoped = liveQuery(
  async () => {
    const collection = folderId
      ? db.documents.where('folderId').equals(folderId)
      : tagId
        ? db.documents.where('tagIds').equals(tagId)
        : db.documents.toCollection();
    return sortDocuments(await collection.toArray());
  },
  { initial: [], deps: () => [folderId, tagId] }
);
const openDocument = liveQuery(async () => (docId ? db.documents.get(docId) : undefined), {
  deps: () => docId,
});

let search = $state('');
let searchInput = $state<HTMLInputElement | null>(null);
let sidebarVisible = $state(typeof window === 'undefined' || window.innerWidth >= 768);
let helpOpen = $state(false);
let folderDialogOpen = $state(false);
let confirmDocumentDelete = $state(false);
let confirmFolderDelete = $state(false);
let dirty = $state(false);
let pendingDiscard = $state<(() => void | Promise<void>) | null>(null);
let editor = $state<{ save(): Promise<void> } | undefined>();

const visible = $derived((scoped.current ?? []).filter((d) => matchesQuery(d, search)));
const counts = $derived.by(() => {
  const byFolder: Record<string, number> = {};
  for (const d of allDocuments.current ?? [])
    byFolder[d.folderId] = (byFolder[d.folderId] ?? 0) + 1;
  return byFolder;
});
const current = $derived(openDocument.current);
const folder = $derived((folders.current ?? []).find((f) => f.id === folderId));
const tag = $derived((tags.current ?? []).find((t) => t.id === tagId));
const scopeName = $derived(folder?.name ?? (tag ? `#${tag.name}` : 'All documents'));

// Like a desktop app, the window title names the open document (else the scope).
$effect(() => {
  document.title = `${current?.title ?? scopeName} · ${runtime.manifest.name}`;
});

const canCreate = $derived(can(CAPABILITIES.documentsCreate));
const canEdit = $derived(can(CAPABILITIES.documentsUpdate));
const canDelete = $derived(can(CAPABILITIES.documentsDelete));
const canCreateFolder = $derived(can(CAPABILITIES.foldersCreate));
const canDeleteFolder = $derived(can(CAPABILITIES.foldersDelete));

function authorName(personaId: string): string {
  if (principal.current?.persona.id === personaId) return 'you';
  return runtime.session.personas().find((p) => p.id === personaId)?.name ?? 'someone';
}

/** Runs `action` now, or after the user confirms discarding unsaved edits. */
async function guard(action: () => void | Promise<void>): Promise<void> {
  if (dirty) pendingDiscard = action;
  else await action();
}

function go(path: string) {
  guard(() => navigate(path));
}

function open(id: string) {
  if (id === docId) return;
  guard(() => navigate(`${scopePath}?doc=${encodeURIComponent(id)}`));
}

function close() {
  guard(() => navigate(scopePath));
}

async function newDocument() {
  if (!canCreate) return toast.info('Your role cannot create documents.');
  const target = folderId ?? (folders.current ?? [])[0]?.id;
  if (!target) return toast.info('Create a folder first.');
  await guard(async () => {
    const result = await runService(() => services.documents.create({ folderId: target }), {
      success: 'Document created',
    });
    if (result.ok) navigate(`/folders/${target}?doc=${encodeURIComponent(result.value.id)}`);
  });
}

function newFolder() {
  if (!canCreateFolder) return toast.info('Your role cannot create folders.');
  folderDialogOpen = true;
}

function focusSearch() {
  searchInput?.focus();
  searchInput?.select();
}

async function deleteDocument() {
  const id = current?.id;
  if (!id) return;
  const result = await runService(() => services.documents.remove(id), {
    success: 'Document deleted',
  });
  if (result.ok) {
    dirty = false;
    navigate(scopePath);
  }
}

async function deleteFolder() {
  const id = folderId;
  if (!id) return;
  const result = await runService(() => services.folders.remove(id), { success: 'Folder deleted' });
  if (result.ok) navigate('/');
  // A non-empty folder is a validation error; say why instead of failing silently.
  else if (isValidationError(result.error)) toast.error(result.error.message);
}

async function togglePin() {
  const doc = current;
  if (!doc) return;
  await runService(() => services.documents.setPinned(doc.id, !doc.pinned), {
    success: doc.pinned ? 'Unpinned' : 'Pinned',
  });
}

function run(id: ShortcutId) {
  if (id === 'new-document') void newDocument();
  else if (id === 'new-folder') newFolder();
  else if (id === 'save') void editor?.save();
  else if (id === 'search') focusSearch();
  else if (id === 'close') {
    if (current) close();
  } else if (id === 'toggle-sidebar') sidebarVisible = !sidebarVisible;
  else if (id === 'help') helpOpen = true;
}

function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  const shortcut = shortcutFor(event, { mac, typing: isTypingTarget(event.target) });
  if (!shortcut) return;
  // Open dialogs own the keyboard (Escape, Enter, focus trap). Closing ones may
  // linger in the DOM during their exit transition, so only `open` counts.
  if (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
    )
  )
    return;
  event.preventDefault();
  run(shortcut.id);
}

const hint = (id: ShortcutId) => shortcutLabel(id, mac);
const menus = $derived<Menu[]>([
  {
    label: 'File',
    items: [
      {
        label: 'New document',
        icon: FilePlus,
        shortcut: hint('new-document'),
        onSelect: () => void newDocument(),
        disabled: !canCreate,
      },
      {
        label: 'New folder…',
        shortcut: hint('new-folder'),
        onSelect: newFolder,
        disabled: !canCreateFolder,
      },
      { type: 'separator' },
      {
        label: 'Save',
        shortcut: hint('save'),
        onSelect: () => void editor?.save(),
        disabled: !current || !canEdit || !dirty,
      },
      { label: 'Close document', shortcut: hint('close'), onSelect: close, disabled: !current },
      { type: 'separator' },
      {
        label: 'Delete document…',
        onSelect: () => (confirmDocumentDelete = true),
        disabled: !current || !canDelete,
        destructive: true,
      },
      {
        label: 'Delete folder…',
        onSelect: () => (confirmFolderDelete = true),
        disabled: !folderId || !canDeleteFolder,
        destructive: true,
      },
    ],
  },
  {
    label: 'Edit',
    items: [
      { label: 'Find…', icon: Search, shortcut: hint('search'), onSelect: focusSearch },
      {
        label: current?.pinned ? 'Unpin document' : 'Pin document',
        onSelect: () => void togglePin(),
        disabled: !current || !canEdit,
      },
    ],
  },
  {
    label: 'View',
    items: [
      {
        label: sidebarVisible ? 'Hide sidebar' : 'Show sidebar',
        icon: PanelLeft,
        shortcut: hint('toggle-sidebar'),
        onSelect: () => (sidebarVisible = !sidebarVisible),
      },
    ],
  },
  {
    label: 'Help',
    items: [
      { label: 'Keyboard shortcuts', shortcut: hint('help'), onSelect: () => (helpOpen = true) },
    ],
  },
]);
</script>

<svelte:window onkeydown={onKeydown} />

<div class="@container flex h-app min-h-0 flex-col bg-background text-foreground">
  <MenuBar {menus} />

  <div class="flex min-h-0 flex-1">
    {#if sidebarVisible}
      <FolderNav
        folders={folders.current ?? []}
        tags={tags.current ?? []}
        {counts}
        total={allDocuments.current?.length ?? 0}
        activePath={scopePath}
        {canCreateFolder}
        ongo={go}
        onnewfolder={newFolder}
      />
    {/if}

    <section
      aria-label={`${scopeName} documents`}
      class={['flex w-72 shrink-0 flex-col border-r border-border', current && '@max-2xl:hidden']}
    >
      <div class="flex items-center gap-2 border-b border-border p-2">
        <label class="relative flex-1">
          <span class="sr-only">Search documents</span>
          <Icon icon="search" class="pointer-events-none absolute top-1 2 left-2.5 size-4 -translate-y-1 2 text-muted-foreground" aria-hidden="true" />
          <Input bind:ref={searchInput} bind:value={search} type="search" placeholder="Search" class="pl-8" />
        </label>
        {#if canCreate}
          <Button variant="ghost" size="icon" aria-label="New document" onclick={() => newDocument()}>
            <LucideIcon icon={FilePlus} />
          </Button>
        {/if}
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        {#if scoped.loading}
          <p class="p-4 text-sm text-muted-foreground">Loading…</p>
        {:else}
          <DocumentList
            documents={visible}
            activeId={docId}
            now={clock.now}
            emptyTitle={search ? 'No matches' : 'No documents here'}
            emptyDescription={search
              ? 'Try another word, or clear the search.'
              : canCreate
                ? `Press ${hint('new-document')} or use File → New document.`
                : 'Documents your team writes appear here.'}
            onopen={open}
          />
        {/if}
      </div>
    </section>

    <main id="main" class="flex min-w-0 flex-1 flex-col">
      {#if current}
        {#key current.id}
          <DocumentEditor
            bind:this={editor}
            bind:dirty
            document={current}
            folders={folders.current ?? []}
            tags={tags.current ?? []}
            {canEdit}
            {canDelete}
            now={clock.now}
            {authorName}
            onclose={close}
            ondelete={() => (confirmDocumentDelete = true)}
          />
        {/key}
      {:else if docId && !openDocument.loading}
        <EmptyState class="m-auto" title="Document not found" description="It may have been deleted. Pick another one from the list." />
      {:else}
        <EmptyState
          class="m-auto"
          title="No document open"
          description={`Pick a document from the list, or press ${hint('help')} to see every shortcut.`}
        />
      {/if}
    </main>
  </div>

  <!-- Right-aligned: the "Prototype" badge sits in the bottom-left corner of standalone builds. -->
  <footer class="flex h-7 shrink-0 items-center justify-end gap-3 border-t border-border bg-surface px-3 text-xs text-muted-foreground">
    <span>{scopeName} · {countLabel(visible.length, 'document')}</span>
    {#if principal.current}
      <span class="flex min-w-0 items-center gap-1.5">
        <Avatar name={principal.current.persona.name} {...avatarImage(principal.current.persona.avatar)} size="xs" decorative />
        <span class="truncate">{principal.current.persona.name} · {ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}</span>
      </span>
    {/if}
  </footer>
</div>

<ShortcutsDialog bind:open={helpOpen} {mac} />
<FolderDialog bind:open={folderDialogOpen} oncreated={(f) => navigate(`/folders/${f.id}`)} />

<AlertDialog
  bind:open={confirmDocumentDelete}
  title="Delete this document?"
  description={current ? `“${current.title}” will be removed from this browser. This cannot be undone.` : ''}
  confirmLabel="Delete document"
  destructive
  onConfirm={deleteDocument}
/>
<AlertDialog
  bind:open={confirmFolderDelete}
  title="Delete this folder?"
  description={folder ? `“${folder.name}” must be empty. Its documents are never deleted with it.` : ''}
  confirmLabel="Delete folder"
  destructive
  onConfirm={deleteFolder}
/>
<!-- Any close (Keep editing, Escape, overlay) clears the pending action. -->
<AlertDialog
  bind:open={
    () => pendingDiscard !== null,
    (value: boolean) => {
      if (!value) pendingDiscard = null;
    }
  }
  title="Discard unsaved changes?"
  description="Your edits to this document have not been saved."
  confirmLabel="Discard changes"
  cancelLabel="Keep editing"
  destructive
  onConfirm={() => {
    const action = pendingDiscard;
    pendingDiscard = null;
    dirty = false;
    return action?.();
  }}
/>
