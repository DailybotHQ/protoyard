<script lang="ts">
import type { ReviewComment, ReviewContext } from '@protoyard/core/review';
import { resolveAnchor } from '@protoyard/review/anchors';
import { onMount, tick } from 'svelte';
import { Button } from 'texuli/button';
import { AlertDialog } from 'texuli/dialog';
import { setTexuliLabels, useMessages } from 'texuli/i18n';
import { Input } from 'texuli/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger, SelectValue } from 'texuli/select';
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
  i18n,
}: ReviewPanelProps = $props();

// A panel mounted on its own root (the session's floating panel, a DevTools tab)
// applies the prototype's dictionary itself.
// svelte-ignore state_referenced_locally
if (i18n) setTexuliLabels(i18n.labels ?? {}, i18n.locale ? { locale: i18n.locale } : {});
// Labels resolve through Texuli's dictionary (protoyard.review.panel.* ids).
const messages = useMessages();
const P = 'protoyard.review.panel';
const unknownScreen = $derived(messages(`${P}.unknown-screen`, 'Unknown screen'));

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
    const screen = thread.anchor?.route.path ?? unknownScreen;
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

async function restore(thread: ReviewComment, allowScenarioSwitch = false): Promise<boolean> {
  const context = thread.context;
  if (!context || !runtime) return false;
  if (needsScenarioSwitch(thread) && !allowScenarioSwitch) {
    scenarioConfirmation = thread;
    return false;
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
    return true;
  } catch (error) {
    restoreError =
      error instanceof Error
        ? error.message
        : messages(`${P}.restore-failed`, 'Could not restore the saved view.');
    return false;
  } finally {
    restoring = false;
  }
}

async function openThread(thread: ReviewComment): Promise<void> {
  if (!thread.anchor) return;
  const path = thread.anchor.route.path;
  if (onNavigate) await onNavigate(path);
  else if (location.hash !== `#${path}`) location.hash = path;
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

<section id="review-comments-panel" class="review-panel" aria-label={messages(`${P}.label`, 'Review comments')}>
  <header class="review-panel__header">
    <h2>{messages(`${P}.title`, 'Comments')} <span aria-label={messages(`${P}.thread-count`, '{count} threads', { count: String(roots.length) })}>({roots.length})</span></h2>
  </header>
  <div class="review-panel__filters" aria-label={messages(`${P}.filters`, 'Filter comments')}>
    <label>{messages(`${P}.state`, 'State')}
      <SelectRoot bind:value={stateFilter} onValueChange={(value) => (stateFilter = value as StateFilter)}>
        <SelectTrigger aria-label={messages(`${P}.filter-state`, 'Filter by state')}><SelectValue placeholder={messages(`${P}.state`, 'State')} /></SelectTrigger>
        <SelectContent><SelectItem value="all">{messages(`${P}.all-states`, 'All states')}</SelectItem><SelectItem value="open">{messages(`${P}.open`, 'Open')}</SelectItem><SelectItem value="resolved">{messages(`${P}.resolved`, 'Resolved')}</SelectItem></SelectContent>
      </SelectRoot>
    </label>
    <label>{messages(`${P}.screen`, 'Screen')}
      <SelectRoot bind:value={screenFilter} onValueChange={(value) => (screenFilter = value)}>
        <SelectTrigger aria-label={messages(`${P}.filter-screen`, 'Filter by screen')}><SelectValue placeholder={messages(`${P}.screen`, 'Screen')} /></SelectTrigger>
        <SelectContent><SelectItem value="all">{messages(`${P}.all-screens`, 'All screens')}</SelectItem>{#each screens as screen}<SelectItem value={screen}>{screen}</SelectItem>{/each}</SelectContent>
      </SelectRoot>
    </label>
    <label>{messages(`${P}.author`, 'Author')}
      <SelectRoot bind:value={authorFilter} onValueChange={(value) => (authorFilter = value)}>
        <SelectTrigger aria-label={messages(`${P}.filter-author`, 'Filter by author')}><SelectValue placeholder={messages(`${P}.author`, 'Author')} /></SelectTrigger>
        <SelectContent><SelectItem value="all">{messages(`${P}.all-authors`, 'All authors')}</SelectItem>{#each authors as author}<SelectItem value={author}>{author}</SelectItem>{/each}</SelectContent>
      </SelectRoot>
    </label>
    <label>{messages(`${P}.anchor`, 'Anchor')}
      <SelectRoot bind:value={orphanFilter} onValueChange={(value) => (orphanFilter = value as OrphanFilter)}>
        <SelectTrigger aria-label={messages(`${P}.filter-anchor`, 'Filter by anchor status')}><SelectValue placeholder={messages(`${P}.anchor`, 'Anchor')} /></SelectTrigger>
        <SelectContent><SelectItem value="all">{messages(`${P}.all-anchors`, 'All anchors')}</SelectItem><SelectItem value="anchored">{messages(`${P}.anchored`, 'Anchored')}</SelectItem><SelectItem value="orphaned">{messages(`${P}.orphaned`, 'Orphaned')}</SelectItem></SelectContent>
      </SelectRoot>
    </label>
    <label class="review-panel__search">{messages(`${P}.search`, 'Search comments')}
      <Input aria-label={messages(`${P}.search`, 'Search comments')} type="search" bind:value={search} placeholder={messages(`${P}.search`, 'Search comments')} />
    </label>
  </div>
  <ul class="review-panel__screens" aria-label={messages(`${P}.counts`, 'Thread counts by screen')}>
    {#each [...countsByScreen] as [screen, count]}<li><span>{screen}</span><span>{count}</span></li>{/each}
  </ul>
  {#if restoreError}<p role="alert" class="review-panel__error">{restoreError}</p>{/if}
  {#if filteredThreads.length === 0}
    <p class="review-panel__empty">{messages(`${P}.empty`, 'No comments match these filters.')}</p>
  {:else}
    <ul class="review-panel__threads" aria-label={messages(`${P}.threads`, 'Comment threads')}>
      {#each filteredThreads as thread (thread.id)}
        <li>
          <article class:selected={selectedThread === thread.id}>
            <Button variant="outline" class="review-panel__thread" type="button" onclick={() => selectThread(thread)}>
              <span class="review-panel__route">{thread.anchor?.route.path ?? unknownScreen}</span>
              <span class="review-panel__body">{thread.body}</span>
              <span class="review-panel__meta">{thread.author.name} · <time datetime={thread.createdAt}>{dateLabel(thread.createdAt)}</time> · {thread.resolvedAt ? messages(`${P}.resolved`, 'Resolved') : messages(`${P}.open`, 'Open')}{orphanedThreadIds.includes(thread.id) ? ` · ${messages(`${P}.orphaned`, 'Orphaned')}` : ''}</span>
            </Button>
            {#if selectedThread === thread.id && needsContextRestore(thread)}
              <Button variant="outline" size="sm" type="button" class="review-panel__restore" disabled={!runtime || restoring} aria-busy={restoring} onclick={() => restore(thread)}>
                {restoring ? messages(`${P}.restoring`, 'Restoring saved view…') : messages(`${P}.restore`, 'Restore saved shell, theme and persona')}
              </Button>
            {/if}
          </article>
        </li>
      {/each}
    </ul>
  {/if}
  {#if scenarioConfirmation}
    <AlertDialog
      open={Boolean(scenarioConfirmation)}
      title={messages(`${P}.switch-title`, 'Switch prototype scenario?')}
      description={messages(
        `${P}.switch-description`,
        'Loading “{scenario}” replaces this prototype’s current data. A safety snapshot will be saved first.',
        { scenario: scenarioConfirmation.context?.scenario ?? '' }
      )}
      cancelLabel={messages(`${P}.cancel`, 'Cancel')}
      confirmLabel={restoring ? messages(`${P}.switching`, 'Switching…') : messages(`${P}.switch-confirm`, 'Switch scenario and open comment')}
      onOpenChange={(open) => { if (!open) scenarioConfirmation = undefined; }}
      onConfirm={async () => {
        const thread = scenarioConfirmation;
        if (thread && !(await restore(thread, true))) throw new Error(restoreError || messages(`${P}.restore-failed`, 'Could not restore the saved view.'));
      }}
    />
  {/if}
</section>

<style>
  .review-panel{display:flex;max-height:100%;min-height:0;flex-direction:column;gap:.75rem;overflow:auto;padding:1rem;color:var(--tx-foreground,#18181b);background:var(--tx-surface,#fff);font:inherit}
  .review-panel__header{display:flex;align-items:center;justify-content:space-between}.review-panel__header h2{margin:0;font-size:1.1rem}
  .review-panel__filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}.review-panel__filters label{display:grid;gap:.25rem;font-size:.75rem;color:var(--tx-muted-foreground,#52525b)}
  .review-panel__search{grid-column:1/-1}
  .review-panel__screens,.review-panel__threads{display:grid;gap:.5rem;margin:0;padding:0;list-style:none}.review-panel__screens{grid-template-columns:repeat(auto-fit,minmax(7rem,1fr));font-size:.75rem}.review-panel__screens li{display:flex;justify-content:space-between;gap:.5rem;border-radius:.375rem;background:var(--tx-muted,#f4f4f5);padding:.4rem .55rem}
  :global(.review-panel__thread){display:grid;width:100%;gap:.25rem;text-align:left;white-space:normal}.review-panel article.selected :global(.review-panel__thread){border-color:var(--tx-primary,#6d28d9)}:global(.review-panel__thread:focus-visible),:global(.review-panel__restore:focus-visible),.review-panel :global(button:focus-visible){outline:3px solid var(--tx-ring,#7c3aed);outline-offset:2px}.review-panel__route{font-weight:650}.review-panel__body{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;white-space:pre-wrap;overflow-wrap:anywhere}.review-panel__meta{font-size:.75rem;color:var(--tx-muted-foreground,#52525b)}
  :global(.review-panel__restore){margin:.4rem}.review-panel__empty,.review-panel__error{margin:.25rem 0;padding:.75rem}.review-panel__error{color:var(--tx-destructive,#b91c1c)}
  @media(max-width:40rem){.review-panel{position:fixed;inset:0 0 0 auto;width:min(22rem,100vw);padding:calc(.75rem + env(safe-area-inset-top,0px)) .75rem calc(.75rem + env(safe-area-inset-bottom,0px));box-shadow:-8px 0 24px rgb(0 0 0 / .18)}}
</style>
