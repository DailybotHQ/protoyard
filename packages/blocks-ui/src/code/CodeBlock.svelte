<script lang="ts">
import type { CodeBlock as CodeBlockData } from '@protoyard/blocks';
import {
  type CodeToken,
  type Grammar,
  resolveHighlightSteps,
  splitTokenLines,
  tokenize,
} from '@protoyard/blocks/code';
import { onDestroy } from 'svelte';
import { getBlockHost } from '../host.ts';
import { loadGrammar } from './grammars.ts';
import { activeHighlightIndex, CODE_TOKEN_STYLES } from './tokens.ts';

/**
 * A code block: tokens become text spans colored by theme tokens (never
 * HTML), the scroller is keyboard-focusable, the copy button writes the exact
 * source, and stepped highlights follow the host's deck step. The grammar of
 * the block's language loads on demand; until it arrives (and for `text`)
 * the lines show as plain text, with the same text and highlights.
 */
let { block }: { block: CodeBlockData } = $props();

const host = getBlockHost();
const uid = $props.id();
const labelId = `code-label-${uid}`;

let grammar = $state<{ lang: string; grammar: Grammar } | null>(null);
$effect(() => {
  const lang = block.lang;
  let current = true;
  void loadGrammar(lang).then((loaded) => {
    if (current) grammar = loaded ? { lang, grammar: loaded } : null;
  });
  return () => {
    current = false;
  };
});
const tokens = $derived.by((): CodeToken[] => {
  if (grammar && grammar.lang === block.lang) return tokenize(block.code, grammar.grammar);
  return block.code === '' ? [] : [{ kind: 'plain', text: block.code }];
});
const lines = $derived(splitTokenLines(tokens));
const tokenized = $derived(grammar !== null && grammar.lang === block.lang);
const steps = $derived(resolveHighlightSteps(block.highlights ?? [], lines.length));
// A deck host maps its dense step numbering to this block's highlights;
// without one, the host's raw step (or the first highlight) is used.
const active = $derived(
  host.codeHighlight
    ? Math.min(steps.length - 1, host.codeHighlight(block))
    : activeHighlightIndex(steps.length, host.step, block.step ?? 0)
);
const highlighted = $derived(new Set(active >= 0 ? steps[active] : []));
const label = $derived(block.filename ?? block.lang.toUpperCase());

let status = $state<'idle' | 'copying' | 'copied' | 'failed'>('idle');
let timer: ReturnType<typeof setTimeout> | undefined;
onDestroy(() => clearTimeout(timer));

async function copy(): Promise<void> {
  clearTimeout(timer);
  status = 'copying';
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(block.code);
    status = 'copied';
  } catch {
    status = 'failed';
  }
  timer = setTimeout(() => (status = 'idle'), 2000);
}
</script>

<figure class="grid gap-2" data-py-code-block data-lang={block.lang} data-tokenized={tokenized || undefined}>
  <div class="overflow-hidden rounded-lg border border-border bg-surface text-surface-foreground">
    <div class="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
      <span id={labelId} class="truncate font-mono text-xs font-medium text-muted-foreground">{label}</span>
      <button
        type="button"
        class="inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:min-h-7"
        aria-label={status === 'copied' ? 'Copied' : `Copy ${label} code`}
        aria-busy={status === 'copying' || undefined}
        disabled={status === 'copying'}
        onclick={() => copy()}
      >
        <!-- Inline strokes keep the code chunk free of the icon library (budget). -->
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          {#if status === 'copied'}
            <path d="M20 6 9 17l-5-5" />
          {:else if status === 'failed'}
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0" />
          {:else}
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          {/if}
        </svg>
        {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy'}
      </button>
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -- long lines scroll; keyboard users must reach them (WCAG 2.1.1). -->
    <!-- Each line ends with a real newline (except the last), so the code's text equals the source; line numbers are CSS content, never text. -->
    <!-- A focusable scroll region needs a role for its name: aria-labelledby is prohibited on a bare pre. -->
    <pre
      role="region"
      tabindex="0"
      aria-labelledby={labelId}
      class="overflow-x-auto py-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><code class="block min-w-max">{#each lines as line, index (index)}{@const number = index + 1}{@const on = highlighted.has(number)}<svelte:element this={on ? 'mark' : 'span'} class={['block border-l-2 pr-4 pl-3', block.lineNumbers && 'before:inline-block before:w-8 before:pr-3 before:text-right before:text-muted-foreground before:content-[attr(data-line)] before:select-none', on ? 'border-primary bg-muted text-inherit' : 'border-transparent']} data-line={number} data-highlighted={on || undefined}>{#each line as token, t (t)}<span class={CODE_TOKEN_STYLES[token.kind].className}>{token.text}</span>{/each}{index < lines.length - 1 ? '\n' : ''}</svelte:element>{/each}</code></pre>
  </div>
  {#if block.caption}
    <figcaption class="text-sm text-muted-foreground">{block.caption}</figcaption>
  {/if}
  <span class="sr-only" aria-live="polite">
    {status === 'copied' ? 'Code copied to the clipboard.' : status === 'failed' ? 'The code could not be copied.' : ''}
  </span>
</figure>
