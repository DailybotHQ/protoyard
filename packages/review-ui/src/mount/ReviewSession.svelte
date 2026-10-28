<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import type {
  ReviewAnchor,
  ReviewAuthor,
  ReviewComment,
  ReviewCommentInput,
  ReviewContext,
} from '@protoyard/core/review';
import { ReviewAuthorSchema, ReviewCommentSchema } from '@protoyard/core/review';
import type { ReviewAdapter } from '@protoyard/review/store';
import { mount, onMount, unmount } from 'svelte';
import { Button } from 'texuli/button';
import { Textarea } from 'texuli/input';
import { createReviewOverlay, type ReviewOverlayHandle } from '../overlay/index.ts';
import type { ReviewPanelProps } from '../panel/types.ts';
import { ReviewToolbar } from '../toolbar/index.ts';
import type { ReviewToolbarPlacer } from '../toolbar/types.ts';
import { createPanelState } from './panel-state.svelte.ts';

let {
  adapter,
  runtime,
  root,
  slug,
  clientId,
  composerOnly = false,
  openComposer = async () => false,
  place,
  panelState = createPanelState(),
  devtoolsPanel = false,
  exportComments,
  importComments,
}: {
  adapter: ReviewAdapter;
  runtime: PrototypeRuntime;
  root: HTMLElement;
  slug: string;
  clientId: string;
  composerOnly?: boolean;
  openComposer?: (element: Element) => Promise<boolean>;
  /** The renderer's floating-chrome placement for the toolbar (shares the demo badge's rules). */
  place?: ReviewToolbarPlacer;
  /** Panel props, shared with DevTools when it hosts the panel. */
  panelState?: ReviewPanelProps;
  /** DevTools shows the comments panel in its "Comments" tab: no floating panel or toolbar button. */
  devtoolsPanel?: boolean;
  /** Local adapter only: the comments of this prototype as a JSON file. */
  exportComments?: () => Promise<Blob>;
  /** Local adapter only: validates a comments file, merges it and returns the rows added or updated. */
  importComments?: (file: Blob) => Promise<number>;
} = $props();

/** Downloads this browser's comments as JSON (to hand to another reviewer). */
async function downloadComments(): Promise<void> {
  if (!exportComments) return;
  const url = URL.createObjectURL(await exportComments());
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug}-review-comments.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Imports a comments file (an exported review, or the prototype's demo review). */
async function importJson(json: string): Promise<void> {
  if (!importComments) return;
  const merged = await importComments(new Blob([json], { type: 'application/json' }));
  await refresh();
  notice =
    merged === 0
      ? 'Nothing new to import.'
      : `Imported ${merged} comment${merged === 1 ? '' : 's'}.`;
  setTimeout(() => (notice = ''), 5000);
}

let comments = $state<ReviewComment[]>([]);
let overlay: ReviewOverlayHandle | undefined;
let panelOpen = $state(false);
let commentMode = $state(false);
let selectedThreadId = $state<string | undefined>();
let status = $state('');
/** A short confirmation (not an error), e.g. after an import. */
let notice = $state('');
let busy = $state(false);
let panelHost: HTMLElement;
let panelInstance: ReturnType<typeof mount> | undefined;
// svelte-ignore state_referenced_locally
const panelProps = panelState;
panelProps.focusThread = (threadId) => {
  overlay?.focusThread(threadId);
  void showThread(threadId);
};
panelProps.setShowResolved = (show) => overlay?.setShowResolved(show);
// svelte-ignore state_referenced_locally
panelProps.runtime = runtime;
// svelte-ignore state_referenced_locally
panelProps.root = root;
const roots = $derived(comments.filter((comment) => comment.id === comment.threadId));
const selectedThread = $derived(comments.find((comment) => comment.id === selectedThreadId));
const selectedRoot = $derived(
  selectedThread
    ? comments.find(
        (comment) => comment.id === selectedThread.threadId && comment.id === comment.threadId
      )
    : undefined
);
const selectedComments = $derived(
  selectedRoot ? comments.filter((comment) => comment.threadId === selectedRoot.id) : []
);
let replyBody = $state('');
let threadBusy = $state(false);

async function refresh(): Promise<void> {
  try {
    comments = await adapter.list(slug);
    panelProps.comments = comments;
    overlay?.setComments(comments);
    status = '';
  } catch (error) {
    status = error instanceof Error ? error.message : 'Could not load review comments.';
  }
}

function authorForReview(): ReviewAuthor | undefined {
  const stored = (() => {
    try {
      return localStorage.getItem(`py-review-author:${slug}`);
    } catch {
      return null;
    }
  })();
  if (stored) {
    try {
      const author = ReviewAuthorSchema.safeParse(JSON.parse(stored));
      if (author.success) return author.data;
    } catch {
      // Ask for a name when local storage contains invalid data.
    }
  }
  const name = window.prompt('Name shown on your review comment (not a login):')?.trim();
  const author = ReviewAuthorSchema.safeParse({ name, clientId });
  if (!author.success) return undefined;
  try {
    localStorage.setItem(`py-review-author:${slug}`, JSON.stringify(author.data));
  } catch {
    // Review remains available for this action even when storage is blocked.
  }
  return author.data;
}

function captureContext(): ReviewContext {
  const appearance = runtime.theme.appearance();
  const scenario = runtime.scenarios.active()?.scenario.id;
  const persona = runtime.session.principal()?.persona.id;
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    shell: appearance.shell.value as ReviewContext['shell'],
    theme: appearance.theme.value,
    mode: appearance.mode.value as ReviewContext['mode'],
    ...(scenario ? { scenario } : {}),
    ...(persona ? { persona } : {}),
  };
}

async function save(input: ReviewCommentInput): Promise<boolean> {
  busy = true;
  status = '';
  try {
    await adapter.put(input);
    await refresh();
    return true;
  } catch (error) {
    status = error instanceof Error ? error.message : 'Could not save this review comment.';
    return false;
  } finally {
    busy = false;
  }
}

async function placeComment(anchor: ReviewAnchor): Promise<void> {
  if (composerOnly) return;
  const author = authorForReview();
  if (!author) return;
  const body = window.prompt('What should be changed?')?.trim();
  if (!body) return;
  const now = new Date().toISOString();
  const id = `review_${crypto.randomUUID().replaceAll('-', '')}`;
  await save(
    ReviewCommentSchema.parse({
      id,
      threadId: id,
      slug,
      body,
      author,
      createdAt: now,
      anchor,
      context: captureContext(),
    })
  );
}

function reviewInput(input: ReviewCommentInput): ReviewCommentInput {
  return ReviewCommentSchema.parse(input);
}

async function reply(input: {
  body: string;
  threadId: string;
  author: ReviewAuthor;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const id = `review_${crypto.randomUUID().replaceAll('-', '')}`;
  return save(
    reviewInput({
      id,
      threadId: input.threadId,
      slug,
      body: input.body,
      author: input.author,
      createdAt: now,
    })
  );
}

async function resolve(
  comment: ReviewComment,
  author: ReviewAuthor,
  resolved: boolean
): Promise<void> {
  await save(
    reviewInput({
      ...comment,
      ...(resolved
        ? { resolvedAt: new Date().toISOString(), resolvedBy: author }
        : { resolvedAt: undefined, resolvedBy: undefined }),
    })
  );
}

async function setPanelOpen(open: boolean): Promise<void> {
  panelOpen = open;
  if (open && !panelInstance) {
    const { default: Panel } = await import('../panel/ReviewPanel.svelte');
    panelProps.comments = comments;
    panelProps.runtime = runtime;
    panelProps.root = root;
    panelInstance = mount(Panel, { target: panelHost, props: panelProps });
  } else if (!open && panelInstance) {
    await unmount(panelInstance);
    panelInstance = undefined;
  }
}

async function showThread(threadId: string): Promise<void> {
  selectedThreadId = threadId;
  if (devtoolsPanel) return;
  panelOpen = true;
  if (!panelInstance) {
    const { default: Panel } = await import('../panel/ReviewPanel.svelte');
    panelProps.comments = comments;
    panelProps.runtime = runtime;
    panelProps.root = root;
    panelInstance = mount(Panel, { target: panelHost, props: panelProps });
  }
}

function closeThread(): void {
  selectedThreadId = undefined;
  replyBody = '';
}

async function sendReply(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!selectedRoot || threadBusy || !replyBody.trim()) return;
  const author = authorForReview();
  if (!author) return;
  threadBusy = true;
  try {
    if (await reply({ body: replyBody, threadId: selectedRoot.id, author })) replyBody = '';
  } finally {
    threadBusy = false;
  }
}

function setCommentMode(active: boolean): void {
  commentMode = active;
  overlay?.setActive(active);
}

onMount(() => {
  const unsubscribe = adapter.subscribe?.(slug, () => void refresh());
  overlay = createReviewOverlay({
    root,
    comments,
    toggle: false,
    // Escape, C and a finished placement change the mode inside the overlay: mirror it.
    onActiveChange: (active: boolean) => {
      commentMode = active;
    },
    onPlace: placeComment,
    onOrphans: (ids: string[]) => {
      panelProps.orphanedThreadIds = ids;
    },
    ...(composerOnly
      ? {
          onCommentInClaude: async (element: Element) => {
            await openComposer(element);
          },
        }
      : {}),
    onOpen: (threadId) => {
      void showThread(threadId);
    },
  });
  void refresh();
  return () => {
    unsubscribe?.();
    overlay?.destroy();
    overlay = undefined;
    if (panelInstance) void unmount(panelInstance);
  };
});
</script>

<ReviewToolbar
  {adapter}
  count={roots.length}
  {commentMode}
  {panelOpen}
  onCommentModeChange={setCommentMode}
  onPanelChange={setPanelOpen}
  showPanelButton={!devtoolsPanel}
  {place}
  onExport={exportComments ? downloadComments : undefined}
  onImport={importComments ? importJson : undefined}
/>

<aside class="review-panel-host" class:open={panelOpen} aria-busy={busy} bind:this={panelHost}></aside>

{#if selectedRoot}
  <section class="review-thread-host" aria-label="Comment thread">
    <header><h2>Thread on {selectedRoot.anchor?.route.path ?? 'this screen'}</h2><Button variant="outline" size="sm" type="button" onclick={closeThread}>Close</Button></header>
    <ol>{#each selectedComments as comment (comment.id)}<li><strong>{comment.author.name}</strong><p>{comment.body}</p><time datetime={comment.createdAt}>{comment.createdAt}</time></li>{/each}</ol>
    {#if selectedRoot.author.clientId === clientId}
      <Button variant="outline" size="sm" type="button" disabled={threadBusy} aria-busy={threadBusy} onclick={() => { const author = authorForReview(); if (author) void resolve(selectedRoot as ReviewComment, author, !selectedRoot?.resolvedAt); }}>
        {selectedRoot.resolvedAt ? 'Reopen thread' : 'Resolve thread'}
      </Button>
    {/if}
    <form onsubmit={sendReply}>
      <label for="review-reply-body">Reply</label><Textarea id="review-reply-body" bind:value={replyBody} maxlength={2000} required rows={4} />
      <Button type="submit" disabled={threadBusy || !replyBody.trim()} aria-busy={threadBusy}>{threadBusy ? 'Sending…' : 'Send reply'}</Button>
    </form>
  </section>
{/if}

{#if status}<p class="review-status" role="alert">{status}</p>{/if}
{#if notice}<p class="review-notice" role="status">{notice}</p>{/if}

<style>
  .review-panel-host{display:none}.review-panel-host.open{position:fixed;z-index:2147482999;top:4.25rem;right:.75rem;bottom:.75rem;display:block;width:min(28rem,calc(100vw - 1.5rem));overflow:auto;border:1px solid var(--tx-border,#d4d4d8);border-radius:.75rem;background:var(--tx-surface,#fff);box-shadow:0 8px 32px rgb(0 0 0 / .24)}
  .review-thread-host{position:fixed;z-index:2147483001;right:1rem;bottom:1rem;width:min(30rem,calc(100vw - 2rem));max-height:80vh;overflow:auto;border:1px solid var(--tx-border,#d4d4d8);border-radius:.75rem;background:var(--tx-surface,#fff);padding:.75rem;color:var(--tx-foreground,#18181b);box-shadow:0 8px 32px rgb(0 0 0 / .24);font:inherit}.review-thread-host header{display:flex;align-items:center;justify-content:space-between;gap:.5rem}.review-thread-host h2{font-size:1rem}.review-thread-host ol{display:grid;gap:.5rem;padding:0;list-style:none}.review-thread-host li{border:1px solid var(--tx-border,#d4d4d8);border-radius:.5rem;padding:.65rem}.review-thread-host p{white-space:pre-wrap;overflow-wrap:anywhere}.review-thread-host time{font-size:.75rem;color:var(--tx-muted-foreground,#52525b)}.review-thread-host form{display:grid;gap:.4rem;margin-top:.75rem}
  .review-notice{position:fixed;z-index:2147483003;right:1rem;bottom:1rem;max-width:min(30rem,calc(100vw - 2rem));border:1px solid var(--tx-border,#d4d4d8);border-radius:.5rem;background:var(--tx-surface,#fff);padding:.75rem;color:var(--tx-foreground,#18181b);box-shadow:0 4px 16px rgb(0 0 0 / .16)}
  .review-status{position:fixed;z-index:2147483003;right:1rem;bottom:1rem;max-width:min(30rem,calc(100vw - 2rem));border-radius:.5rem;background:var(--tx-destructive,#b91c1c);padding:.75rem;color:#fff}
  @media(max-width:40rem){.review-panel-host.open{inset:4.25rem .5rem .5rem;width:auto}.review-thread-host{inset:auto .5rem .5rem;width:auto;max-height:70vh}}
</style>
