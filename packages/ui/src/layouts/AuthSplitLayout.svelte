<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '../lib/cn.ts';

interface Props {
  form: Snippet;
  brand?: Snippet;
  brandTitle?: string;
  brandDescription?: string;
  class?: string;
}

let {
  form,
  brand,
  brandTitle = 'A clearer way to work',
  brandDescription = 'Bring your team and your ideas together in one place.',
  class: className,
}: Props = $props();
</script>

<main class={cn('grid min-h-app bg-background text-foreground lg:grid-cols-2', className)} data-py-auth-split-layout>
  <section class="flex min-w-0 items-center justify-center px-4 py-10 sm:px-8 lg:px-12" aria-label="Sign in">
    <div class="w-full max-w-md space-y-8">
      <div class="text-sm font-semibold">{@render brand?.()}</div>
      {@render form()}
    </div>
  </section>

  <aside
    class="relative hidden min-h-app overflow-hidden border-l border-border bg-primary text-primary-foreground lg:flex lg:items-center lg:justify-center lg:px-12 lg:py-16"
    aria-label="About this workspace"
  >
    <svg
      class="pointer-events-none absolute inset-0 size-full opacity-20"
      viewBox="0 0 480 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 48h480M0 128h480M0 208h480M0 288h480M0 368h480M0 448h480M0 528h480M0 608h480M40 0v640M120 0v640M200 0v640M280 0v640M360 0v640M440 0v640"
        stroke="currentColor"
        stroke-width="1"
      />
      <path
        d="M40 48l40 40 40-40 40 40 40-40 40 40 40-40 40 40 40-40 40 40 40-40M40 208l40 40 40-40 40 40 40-40 40 40 40-40 40 40 40-40 40 40 40-40M40 368l40 40 40-40 40 40 40-40 40 40 40-40 40 40 40-40 40 40 40-40M40 528l40 40 40-40 40 40 40-40 40 40 40-40 40 40 40-40 40 40 40-40"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
    </svg>
    <div class="relative z-10 w-full max-w-lg rounded-2xl border border-primary-foreground/20 bg-primary/70 p-8 shadow-float backdrop-blur-sm sm:p-10">
      {#if brand}
        {@render brand()}
      {:else}
        <p class="mb-4 text-sm font-medium text-primary-foreground/75">Protoyard</p>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{brandTitle}</h1>
        <p class="mt-4 max-w-md text-base leading-7 text-primary-foreground/80">{brandDescription}</p>
      {/if}
    </div>
  </aside>
</main>
