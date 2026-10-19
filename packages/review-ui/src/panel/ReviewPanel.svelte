<script lang="ts">
import type { ReviewComment, ReviewContext } from '@protoyard/core/review';
import { navigate } from '@protoyard/renderer-svelte';
import { resolveAnchor } from '@protoyard/review/anchors';
import { onMount, tick } from 'svelte';
import type { ReviewPanelProps } from './types.ts';

let {
  comments,
  currentContext,
  runtime,
  root,
  focusThread,
  setShowResolved,
  onNavigate,
  orphanedThreadIds = [],
}: ReviewPanelProps = $props();

type StateFilter = 'all' | 'open' | 'resolved';
type OrphanFilter = 'all' | 'anchored' | 'orphaned';
let stateFilter = $state<StateFilter>('open');
let orphanFilter = $state<OrphanFilter>('all');
let screenFilter = $state('all');
let authorFilter = $state('all');
let search = $state('');
let selectedThread = $state<string | undefined>();
let capturedContext = $state<ReviewContext | undefined>();
let restoreError = $state('');
let restoring = $state(false);
let scenarioConfirmation = $state<ReviewComment | undefined>();
let restoredThreadId = $state<string | undefined>();

const roots = $derived(comments.filter((comment) => comment.id === comment.threadId));
const screens = $derived(
  [
    ...new Set(
      roots
        .map((thread) => thread.anchor?.route.path)
        .filter((value): value is string => Boolean(value))
    ),
  ].sort()
);
const authors = $derived([...new Set(roots.map((thread) => thread.author.name))].sort());
const countsByScreen = $derived.by(() => {
  const counts = new Map<string, number>();
  for (const thread of roots) {
    const screen = thread.anchor?.route.path ?? 'Unknown screen';
    counts.set(screen, (counts.get(screen) ?? 0) + 1);
  }
  return counts;
});
const filteredThreads = $derived.by(() => {
  const query = search.trim().toLocaleLowerCase();
  return roots.filter((thread) => {
    const isResolved = Boolean(thread.resolvedAt);
    const orphaned = orphanedThreadIds.includes(thread.id);
    const screen = thread.anchor?.route.path ?? '';
    if (stateFilter === 'open' && isResolved) return false;
    if (stateFilter === 'resolved' && !isResolved) return false;
    if (orphanFilter === 'orphaned' && !orphaned) return false;
    if (orphanFilter === 'anchored' && orphaned) return false;
    if (screenFilter !== 'all' && screen !== screenFilter) return false;
    if (authorFilter !== 'all' && thread.author.name !== authorFilter) return false;
    return (
      !query || `${thread.body} ${thread.author.name} ${screen}`.toLocaleLowerCase().includes(query)
    );
  });
});

function sameContext(left: ReviewContext | undefined, right: ReviewContext | undefined): boolean {
  if (!left || !right) return !left && !right;
  return ['scenario', 'persona', 'shell', 'theme', 'mode', 'layout'].every(
    (key) => left[key as keyof ReviewContext] === right[key as keyof ReviewContext]
  );
}

function activeScenarioId(): string | undefined {
  return runtime?.scenarios.active()?.scenario.id ?? (currentContext ?? capturedContext)?.scenario;
}

function needsScenarioSwitch(thread: ReviewComment): boolean {
  return Boolean(thread.context?.scenario && thread.context.scenario !== activeScenarioId());
}

function needsContextRestore(thread: ReviewComment): boolean {
  if (restoredThreadId === thread.id) return false;
  if (!thread.context) return false;
  const appearance = runtime?.theme.appearance();
  const current: ReviewContext | undefined =
    currentContext ??
    capturedContext ??
    (appearance
      ? {
          viewport: thread.context.viewport,
          shell: appearance.shell.value as ReviewContext['shell'],
          theme: appearance.theme.value,
          mode: appearance.mode.value as ReviewContext['mode'],
          persona: runtime?.session.principal()?.persona.id,
          scenario: activeScenarioId(),
        }
      : undefined);
  return !sameContext(thread.context, current);
}

async function restore(thread: ReviewComment, allowScenarioSwitch = false): Promise<void> {
  const context = thread.context;
  if (!context || !runtime) return;
  if (needsScenarioSwitch(thread) && !allowScenarioSwitch) {
    scenarioConfirmation = thread;
    return;
  }
  restoring = true;
  restoreError = '';
  try {
    if (needsScenarioSwitch(thread) && context.scenario) {
      await runtime.scenarios.load(context.scenario, { snapshotFirst: true });
    }
    if (context.persona) await runtime.session.switchActor(context.persona);
    await runtime.theme.setOverride({
      ...(context.theme ? { themeId: context.theme } : {}),
      ...(context.mode ? { mode: context.mode } : {}),
      ...(context.shell ? { shell: context.shell } : {}),
    });
    scenarioConfirmation = undefined;
    restoredThreadId = thread.id;
    await openThread(thread);
  } catch (error) {
    restoreError = error instanceof Error ? error.message : 'Could not restore the saved view.';
  } finally {
    restoring = false;
  }
}

async function openThread(thread: ReviewComment): Promise<void> {
  if (!thread.anchor) return;
  const path = thread.anchor.route.path;
  if (onNavigate) await onNavigate(path);
  else navigate(path);
  selectedThread = thread.id;
  await tick();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const targetRoot =
    root ??
    document.querySelector<HTMLElement>('[data-py-portal-root]') ??
    document.querySelector<HTMLElement>('#app');
  if (targetRoot) {
    try {
      const resolved = resolveAnchor(thread.anchor, targetRoot);
      if (!resolved.orphaned)
        resolved.element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    } catch {
      // The pin callback still gets a chance to focus or mark an orphaned anchor.
    }
  }
  if (thread.resolvedAt) setShowResolved?.(true);
  focusThread?.(thread.id);
}

async function selectThread(thread: ReviewComment): Promise<void> {
  restoreError = '';
  scenarioConfirmation = undefined;
  selectedThread = thread.id;
  if (needsScenarioSwitch(thread)) {
    scenarioConfirmation = thread;
    return;
  }
  await openThread(thread);
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

onMount(() => {
  if (!runtime || currentContext) return;
  const appearance = runtime.theme.appearance();
  capturedContext = {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    shell: appearance.shell.value as ReviewContext['shell'],
    theme: appearance.theme.value,
    mode: appearance.mode.value as ReviewContext['mode'],
    scenario: activeScenarioId(),
    persona: runtime.session.principal()?.persona.id,
  };
});
</script>

<section id="review-comments-panel" class="review-panel" aria-label="Review comments">
  <header class="review-panel__header">
    <h2>Comments <span aria-label={`${roots.length} threads`}>({roots.length})</span></h2>
  </header>
  <div class="review-panel__filters" aria-label="Filter comments">
    <label>State
      <select aria-label="Filter by state" value={stateFilter} onchange={(event) => (stateFilter = event.currentTarget.value as StateFilter)}>
        <option value="all">All states</option><option value="open">Open</option><option value="resolved">Resolved</option>
      </select>
    </label>
    <label>Screen
      <select aria-label="Filter by screen" value={screenFilter} onchange={(event) => (screenFilter = event.currentTarget.value)}>
        <option value="all">All screens</option>{#each screens as screen}<option value={screen}>{screen}</option>{/each}
      </select>
    </label>
    <label>Author
      <select aria-label="Filter by author" value={authorFilter} onchange={(event) => (authorFilter = event.currentTarget.value)}>
        <option value="all">All authors</option>{#each authors as author}<option value={author}>{author}</option>{/each}
      </select>
    </label>
    <label>Anchor
      <select aria-label="Filter by anchor status" value={orphanFilter} onchange={(event) => (orphanFilter = event.currentTarget.value as OrphanFilter)}>
        <option value="all">All anchors</option><option value="anchored">Anchored</option><option value="orphaned">Orphaned</option>
      </select>
    </label>
    <label class="review-panel__search">Search comments
      <input aria-label="Search comments" type="search" value={search} oninput={(event) => (search = event.currentTarget.value)} placeholder="Search comments" />
    </label>
  </div>
  <ul class="review-panel__screens" aria-label="Thread counts by screen">
    {#each [...countsByScreen] as [screen, count]}<li><span>{screen}</span><span>{count}</span></li>{/each}
  </ul>
  {#if restoreError}<p role="alert" class="review-panel__error">{restoreError}</p>{/if}
  {#if filteredThreads.length === 0}
    <p class="review-panel__empty">No comments match these filters.</p>
  {:else}
    <ul class="review-panel__threads" aria-label="Comment threads">
      {#each filteredThreads as thread (thread.id)}
        <li>
          <article class:selected={selectedThread === thread.id}>
            <button class="review-panel__thread" type="button" onclick={() => selectThread(thread)}>
              <span class="review-panel__route">{thread.anchor?.route.path ?? 'Unknown screen'}</span>
              <span class="review-panel__body">{thread.body}</span>
              <span class="review-panel__meta">{thread.author.name} · <time datetime={thread.createdAt}>{dateLabel(thread.createdAt)}</time> · {thread.resolvedAt ? 'Resolved' : 'Open'}{orphanedThreadIds.includes(thread.id) ? ' · Orphaned' : ''}</span>
            </button>
            {#if selectedThread === thread.id && needsContextRestore(thread)}
              <button type="button" class="review-panel__restore" disabled={!runtime || restoring} aria-busy={restoring} onclick={() => restore(thread)}>
                {restoring ? 'Restoring saved view…' : 'Restore saved shell, theme and persona'}
              </button>
            {/if}
          </article>
        </li>
      {/each}
    </ul>
  {/if}
  {#if scenarioConfirmation}
    <div class="review-panel__scrim">
      <div class="review-panel__confirm" role="alertdialog" aria-modal="true" aria-labelledby="review-scenario-title" aria-describedby="review-scenario-description">
        <h3 id="review-scenario-title">Switch prototype scenario?</h3>
        <p id="review-scenario-description">Loading “{scenarioConfirmation.context?.scenario}” replaces this prototype’s current data. A safety snapshot will be saved first.</p>
        <div class="review-panel__confirm-actions">
          <button type="button" onclick={() => { scenarioConfirmation = undefined; }} disabled={restoring}>Cancel</button>
          <button type="button" onclick={() => scenarioConfirmation && restore(scenarioConfirmation, true)} disabled={!runtime || restoring} aria-busy={restoring}>{restoring ? 'Switching…' : 'Switch scenario and open comment'}</button>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .review-panel{display:flex;max-height:100%;min-height:0;flex-direction:column;gap:.75rem;overflow:auto;padding:1rem;color:var(--py-foreground,#18181b);background:var(--py-surface,#fff);font:inherit}
  .review-panel__header{display:flex;align-items:center;justify-content:space-between}.review-panel__header h2{margin:0;font-size:1.1rem}
  .review-panel__filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}.review-panel__filters label{display:grid;gap:.25rem;font-size:.75rem;color:var(--py-muted-foreground,#52525b)}
  .review-panel select,.review-panel input{min-width:0;border:1px solid var(--py-border,#d4d4d8);border-radius:.375rem;background:var(--py-surface,#fff);color:var(--py-foreground,#18181b);padding:.45rem;font:inherit}.review-panel__search{grid-column:1/-1}
  .review-panel__screens,.review-panel__threads{display:grid;gap:.5rem;margin:0;padding:0;list-style:none}.review-panel__screens{grid-template-columns:repeat(auto-fit,minmax(7rem,1fr));font-size:.75rem}.review-panel__screens li{display:flex;justify-content:space-between;gap:.5rem;border-radius:.375rem;background:var(--py-muted,#f4f4f5);padding:.4rem .55rem}
  .review-panel__thread{display:grid;width:100%;gap:.25rem;border:1px solid var(--py-border,#d4d4d8);border-radius:.5rem;background:var(--py-surface,#fff);padding:.7rem;text-align:left;color:inherit;cursor:pointer}.review-panel article.selected .review-panel__thread{border-color:var(--py-primary,#6d28d9)}.review-panel__thread:focus-visible,.review-panel__restore:focus-visible,.review-panel button:focus-visible{outline:3px solid var(--py-ring,#7c3aed);outline-offset:2px}.review-panel__route{font-weight:650}.review-panel__body{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:pre-wrap;overflow-wrap:anywhere}.review-panel__meta{font-size:.75rem;color:var(--py-muted-foreground,#52525b)}
  .review-panel__restore{margin:.4rem;border:1px solid var(--py-border,#d4d4d8);border-radius:.375rem;background:var(--py-muted,#f4f4f5);padding:.45rem .65rem;color:inherit;cursor:pointer}.review-panel__empty,.review-panel__error{margin:.25rem 0;padding:.75rem}.review-panel__error{color:var(--py-destructive,#b91c1c)}
  .review-panel__scrim{position:fixed;inset:0;z-index:2147483002;display:grid;place-items:center;background:rgb(0 0 0 / .48);padding:1rem}.review-panel__confirm{width:min(28rem,100%);border:1px solid var(--py-border,#d4d4d8);border-radius:.75rem;background:var(--py-surface,#fff);padding:1rem;color:var(--py-foreground,#18181b);box-shadow:0 12px 48px rgb(0 0 0 / .25)}.review-panel__confirm h3{margin:0 0 .5rem}.review-panel__confirm p{line-height:1.5}.review-panel__confirm-actions{display:flex;justify-content:flex-end;gap:.5rem}.review-panel__confirm-actions button{border:1px solid var(--py-border,#d4d4d8);border-radius:.4rem;background:var(--py-surface,#fff);padding:.5rem .7rem;color:inherit;cursor:pointer}.review-panel__confirm-actions button:last-child{background:var(--py-primary,#6d28d9);color:var(--py-primary-foreground,#fff)}
  @media(max-width:40rem){.review-panel{position:fixed;inset:0 0 0 auto;width:min(22rem,100vw);padding:calc(.75rem + env(safe-area-inset-top,0px)) .75rem calc(.75rem + env(safe-area-inset-bottom,0px));box-shadow:-8px 0 24px rgb(0 0 0 / .18)}}
</style>
