<script lang="ts">
import { onMount } from 'svelte';
import type { BlueprintKind } from './run-kind.ts';

/**
 * Shown by a per-kind player page (deck.html, page.html, doc.html) handed a
 * blueprint of another kind: what it is, and a link to the page that runs it.
 * The name comes from the untrusted loader and renders as text only.
 */
let {
  expected,
  actual,
  name,
  href,
}: {
  expected: 'deck' | 'page' | 'doc';
  actual: BlueprintKind;
  name: string;
  href: string;
} = $props();

const NOUN: Record<BlueprintKind, string> = {
  app: 'an app',
  deck: 'a deck',
  page: 'a page',
  doc: 'a document',
};
const PAGE: Record<BlueprintKind, string> = {
  app: 'the app player',
  deck: 'the deck player',
  page: 'the page player',
  doc: 'the document player',
};

let heading = $state<HTMLHeadingElement | null>(null);
onMount(() => heading?.focus());
</script>

<main class="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
  <section
    class="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-float"
    aria-labelledby="py-kind-mismatch-title"
    data-py-kind-mismatch={actual}
  >
    <h1 id="py-kind-mismatch-title" class="text-lg font-semibold outline-none" tabindex="-1" bind:this={heading}>
      This blueprint is {NOUN[actual]}, not {NOUN[expected]}
    </h1>
    <p class="mt-2 text-sm text-muted-foreground">
      <span class="font-medium text-foreground">{name}</span> is {NOUN[actual]}. This page only runs
      {expected === 'doc' ? 'documents' : `${expected}s`}; open it in {PAGE[actual]} instead.
    </p>
    <a
      class="mt-5 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      {href}
      data-py-kind-mismatch-link
    >
      Open in {PAGE[actual]}
    </a>
  </section>
</main>
