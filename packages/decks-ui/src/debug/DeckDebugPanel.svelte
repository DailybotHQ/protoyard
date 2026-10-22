<script lang="ts">
import {
  type AgentReferenceSource,
  describeSlideForAgent,
  formatAgentReference,
} from '@protoyard/decks/agent';
import { checkDeckStatic } from '@protoyard/decks/quality';
import type { Deck, DeckSlide } from '@protoyard/decks/schema';
import { onMount, tick } from 'svelte';
import { copyText } from '../chrome/clipboard.ts';
import BlockOutline from './BlockOutline.svelte';
import { deckFileName, downloadText, inertJson } from './format.ts';

/**
 * "Debug for agents": the slide on screen as a coding agent needs it. The
 * record (id, position, step, layout, JSON pointers, blocks, text) comes from
 * `describeSlideForAgent`, the findings from `checkDeckStatic`. Four actions
 * copy or save it; outline mode draws each block's box and pointer on the
 * stage. A side sheet, not a modal: the deck keeps its keys, D toggles it and
 * Esc closes it first. Every string is rendered as text; nothing is fetched.
 */
let {
  deck,
  slideId,
  step = 0,
  root,
  source = null,
  onjump,
  onclose,
  onnotify,
}: {
  deck: Deck;
  slideId: string;
  step?: number;
  /** The deck root, for outline mode. */
  root: HTMLElement | undefined;
  /** Where the deck came from (a blueprint path, a prototype slug, a share id). */
  source?: AgentReferenceSource | null;
  onjump: (slideId: string) => void;
  onclose: () => void;
  /** Feedback for the deck's toast. */
  onnotify: (message: string, tone?: 'info' | 'error') => void;
} = $props();

const issues = $derived(checkDeckStatic(deck).issues);
const record = $derived(
  describeSlideForAgent(
    deck,
    { slideId, step },
    {
      source,
      findings: issues,
      url: typeof window === 'undefined' ? null : window.location.href,
    }
  )
);
const rawSlide = $derived<DeckSlide | undefined>(deck.slides[record.slide.index]);
/** Slides other than this one that have findings, in deck order. */
const otherSlides = $derived.by(() => {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    if (issue.slideId && issue.slideId !== record.slide.id) {
      counts.set(issue.slideId, (counts.get(issue.slideId) ?? 0) + 1);
    }
  }
  return deck.slides
    .filter((slide) => counts.has(slide.id))
    .map((slide) => ({ id: slide.id, count: counts.get(slide.id) ?? 0 }));
});

let outline = $state(false);
let closeButton = $state<HTMLButtonElement | undefined>();
let opener: HTMLElement | null = null;
const uid = $props.id();
const titleId = `py-deck-debug-${uid}`;

onMount(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  void tick().then(() => closeButton?.focus({ preventScroll: true }));
  return () => {
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
});

async function copy(text: string, what: string): Promise<void> {
  if (await copyText(text)) onnotify(`${what} copied`);
  else onnotify(`Could not copy the ${what.toLowerCase()}`, 'error');
}

function download(): void {
  const ok = downloadText(inertJson(deck), deckFileName(record.deck.id));
  onnotify(ok ? 'Deck JSON downloaded' : 'Could not save the deck JSON', ok ? 'info' : 'error');
}

const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-9';
</script>

{#if outline}
  <BlockOutline
    {root}
    slideId={record.slide.id}
    slidePointer={record.slide.pointer}
    propsPointer={record.slide.propsPointer}
  />
{/if}

<aside
  class="absolute inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-background text-foreground shadow-xl"
  aria-labelledby={titleId}
  data-py-deck-debug
  data-py-deck-chrome
>
  <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
    <h2 id={titleId} class="text-base font-semibold">Debug for agents</h2>
    <button bind:this={closeButton} type="button" class={buttonClass} onclick={onclose}>Close</button>
  </div>

  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 text-sm">
    <section aria-label="This slide">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt class="text-muted-foreground">Slide</dt>
        <dd class="font-mono break-all" data-py-deck-debug-slide>{record.slide.id}</dd>
        <dt class="text-muted-foreground">Position</dt>
        <dd>{record.slide.hidden ? 'hidden' : `${record.slide.position} of ${record.slide.total}`}, step {record.slide.step} of {record.slide.steps}</dd>
        <dt class="text-muted-foreground">Layout</dt>
        <dd class="font-mono">{record.slide.layout}</dd>
        <dt class="text-muted-foreground">Pointer</dt>
        <dd class="font-mono break-all" data-py-deck-debug-pointer>{record.slide.pointer}</dd>
        {#if record.slide.propsPointer}
          <dt class="text-muted-foreground">Props</dt>
          <dd class="font-mono break-all">{record.slide.propsPointer}</dd>
        {/if}
        <dt class="text-muted-foreground">Deck</dt>
        <dd class="font-mono break-all">{record.deck.id ?? 'unnamed'}</dd>
        <dt class="text-muted-foreground">Notes</dt>
        <dd>{record.notes.present ? `${record.notes.characters} characters` : 'none'}</dd>
      </dl>
    </section>

    <section aria-label="Actions" class="grid gap-2 sm:grid-cols-2">
      <button type="button" class={buttonClass} data-py-deck-debug-action="reference" onclick={() => copy(formatAgentReference(record, 'line'), 'Agent reference')}>Copy agent reference</button>
      <button type="button" class={buttonClass} data-py-deck-debug-action="prompt" onclick={() => copy(formatAgentReference(record, 'markdown'), 'Agent prompt')}>Copy as agent prompt</button>
      <button type="button" class={buttonClass} data-py-deck-debug-action="slide-json" onclick={() => copy(inertJson(rawSlide ?? null), 'Slide JSON')}>Copy slide JSON</button>
      <button type="button" class={buttonClass} data-py-deck-debug-action="download" onclick={download}>Download deck JSON</button>
      <button
        type="button"
        class={`${buttonClass} aria-pressed:border-primary aria-pressed:bg-primary/10`}
        style="grid-column: 1 / -1"
        aria-pressed={outline}
        data-py-deck-debug-action="outline"
        onclick={() => (outline = !outline)}
      >
        Outline blocks
      </button>
    </section>

    <section aria-labelledby={`${titleId}-findings`}>
      <h3 id={`${titleId}-findings`} class="mb-2 font-semibold">Checks on this slide</h3>
      {#if record.findings.length === 0}
        <p class="text-muted-foreground">No findings on this slide.</p>
      {:else}
        <ul class="space-y-2" data-py-deck-debug-findings>
          {#each record.findings as finding, index (`${finding.rule}:${finding.pointer}:${index}`)}
            <li class="rounded-md border border-border p-2">
              <p><span class={finding.severity === 'error' ? 'font-semibold text-destructive' : 'font-semibold'}>{finding.severity}</span> <span class="font-mono">{finding.rule}</span></p>
              <p class="font-mono text-xs break-all text-muted-foreground">{finding.pointer}</p>
              <p>{finding.message}</p>
            </li>
          {/each}
        </ul>
      {/if}
      {#if otherSlides.length > 0}
        <h4 class="mt-3 mb-2 font-medium">Other slides with findings</h4>
        <ul class="flex flex-wrap gap-2">
          {#each otherSlides as other (other.id)}
            <li>
              <button type="button" class={buttonClass} data-py-deck-debug-jump={other.id} onclick={() => onjump(other.id)}>
                {other.id} ({other.count})
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if record.blocks.length > 0}
      <section aria-labelledby={`${titleId}-blocks`}>
        <h3 id={`${titleId}-blocks`} class="mb-2 font-semibold">Blocks</h3>
        <ul class="space-y-1 font-mono text-xs">
          {#each record.blocks as block (block.pointer)}
            <li class="break-all"><span class="text-muted-foreground">{block.pointer}</span> {block.type}{block.id ? ` #${block.id}` : ''}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <section aria-labelledby={`${titleId}-text`}>
      <h3 id={`${titleId}-text`} class="mb-2 font-semibold">Slide text</h3>
      <p class="whitespace-pre-wrap text-muted-foreground" data-py-deck-debug-text>{record.text || '(no text)'}</p>
    </section>
  </div>
</aside>
