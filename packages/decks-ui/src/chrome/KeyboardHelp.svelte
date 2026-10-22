<script lang="ts">
import {
  availableDeckControls,
  DECK_CONTROL_GROUPS,
  DEFAULT_DECK_CONTROL_ENVIRONMENT,
  type DeckControlEnvironment,
  type DeckControlGroup,
} from '@protoyard/decks';
import { onMount, tick } from 'svelte';
import { DECK_ICON_PATHS } from './icons.ts';

/**
 * "Controls and shortcuts": every control available here, grouped as in the
 * toolbar, with the same icon, label, description and keys, all read from
 * `DECK_CONTROLS` so the guide can never drift from the buttons or the keys.
 * Focus moves to Close on open and back to the opener on close; Escape and ?
 * close it through the deck's key handling.
 */
let {
  id,
  environment = DEFAULT_DECK_CONTROL_ENVIRONMENT,
  onclose,
}: {
  id?: string;
  /** What this host supports; unavailable controls are left out. */
  environment?: DeckControlEnvironment;
  onclose: () => void;
} = $props();

const GROUP_NAMES: Readonly<Record<DeckControlGroup, string>> = {
  navigate: 'Move around',
  view: 'View',
  present: 'Present',
  share: 'Share and print',
  help: 'Help',
  debug: 'Debug',
};

const groups = $derived(
  DECK_CONTROL_GROUPS.map((group) => ({
    group,
    controls: availableDeckControls(environment).filter((control) => control.group === group),
  })).filter((entry) => entry.controls.length > 0)
);

let closeButton = $state<HTMLButtonElement | undefined>();
let opener: HTMLElement | null = null;

onMount(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  void tick().then(() => closeButton?.focus({ preventScroll: true }));
  return () => {
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
});
</script>

<div
  {id}
  class="absolute inset-0 z-30 grid place-items-center bg-background/90 p-3 backdrop-blur sm:p-6"
  role="dialog"
  aria-modal="true"
  aria-labelledby={`${id ?? 'deck-help'}-title`}
  data-py-deck-help
  data-py-deck-chrome
>
  <div class="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-border bg-card text-card-foreground shadow-lg">
    <div class="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
      <h2 id={`${id ?? 'deck-help'}-title`} class="text-lg font-semibold">Controls and shortcuts</h2>
      <button
        bind:this={closeButton}
        type="button"
        class="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-8 sm:text-xs"
        onclick={onclose}
      >
        Close
      </button>
    </div>
    <div class="min-h-0 overflow-y-auto px-5 py-3">
      {#each groups as { group, controls } (group)}
        <section class="py-2" data-py-deck-help-group={group}>
          <h3 class="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{GROUP_NAMES[group]}</h3>
          <ul class="space-y-2">
            {#each controls as control (control.id)}
              <li class="grid grid-cols-[auto_1fr] items-start gap-x-3" data-py-deck-help-control={control.id}>
                <svg aria-hidden="true" viewBox="0 0 24 24" class="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  {#each DECK_ICON_PATHS[control.icon] as path (path)}<path d={path}></path>{/each}
                </svg>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="text-sm font-medium">{control.label}</span>
                    {#if control.keys.length > 0}
                      <span class="flex flex-wrap gap-1">
                        {#each control.keys as key (key.label)}
                          <kbd class="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{key.label}</kbd>
                        {/each}
                      </span>
                    {:else}
                      <span class="text-xs text-muted-foreground">Button only</span>
                    {/if}
                  </div>
                  <p class="text-sm text-muted-foreground">{control.description}</p>
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  </div>
</div>
