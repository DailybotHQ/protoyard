<script lang="ts">
import {
  availableDeckControls,
  DECK_CONTROL_GROUPS,
  DEFAULT_DECK_CONTROL_ENVIRONMENT,
  type DeckControl,
  type DeckControlEnvironment,
  type DeckInputAction,
} from '@protoyard/decks';
import type { DeckSlide } from '@protoyard/decks/schema';
import ChromeTooltip from './ChromeTooltip.svelte';
import { copyText } from './clipboard.ts';
import { type DeckFullscreenMode, FULLSCREEN_WINDOW_DESCRIPTION } from './fullscreen.ts';
import { DECK_ICON_PATHS } from './icons.ts';
import MoreMenu from './MoreMenu.svelte';
import { controlTooltip, createDeckTooltip } from './tooltip.ts';

let {
  blackout = false,
  laser = false,
  help = false,
  overview = false,
  presenter = false,
  fullscreen = false,
  debug = false,
  fullscreenPreferred = 'native',
  helpId,
  reference,
  slides = [],
  currentOrdinal = 1,
  environment = DEFAULT_DECK_CONTROL_ENVIRONMENT,
  onaction,
  onjump = () => {},
  oncopied,
}: {
  blackout?: boolean;
  laser?: boolean;
  help?: boolean;
  overview?: boolean;
  presenter?: boolean;
  fullscreen?: boolean;
  /** True while the debug panel is open. */
  debug?: boolean;
  /** `window` when full screen will fill the window instead (the tooltip says so). */
  fullscreenPreferred?: DeckFullscreenMode;
  helpId?: string;
  reference: () => string;
  slides?: readonly DeckSlide[];
  currentOrdinal?: number;
  environment?: DeckControlEnvironment;
  onaction: (action: DeckInputAction) => void;
  onjump?: (slideId: string) => void;
  /**
   * The copy result, for a host that shows it (DeckApp's toast). Without it
   * the toolbar announces the result in its own live region.
   */
  oncopied?: (ok: boolean) => void;
} = $props();

let compact = $state(false);
let jumpOpen = $state(false);
let jumpButton = $state<HTMLButtonElement>();
let copyStatus = $state<'idle' | 'copied' | 'failed'>('idle');
let copyTimer: ReturnType<typeof setTimeout> | undefined;
const tooltip = createDeckTooltip({ suppressed: () => blackout || laser });
const controls = $derived(
  availableDeckControls(environment).filter((control) => control.action !== 'fullscreen-exit')
);
const navControls = $derived(controls.filter((control) => control.group === 'navigate'));
const mobileSecondaryControls = $derived(
  controls.filter(
    (control) =>
      control.group !== 'navigate' || control.action === 'first' || control.action === 'last'
  )
);

const buttonClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-border bg-background/90 px-2 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary';

function pressed(action: DeckInputAction): boolean {
  switch (action) {
    case 'blackout':
      return blackout;
    case 'laser':
      return laser;
    case 'help':
      return help;
    case 'overview':
      return overview;
    case 'presenter':
      return presenter;
    case 'fullscreen':
    case 'fullscreen-exit':
      return fullscreen;
    case 'debug':
      return debug;
    default:
      return false;
  }
}

function actionFor(control: DeckControl): DeckInputAction {
  return control.action === 'fullscreen' && fullscreen ? 'fullscreen-exit' : control.action;
}

function tooltipFor(control: DeckControl) {
  const content = controlTooltip(control);
  return control.action === 'fullscreen' && fullscreenPreferred === 'window'
    ? { ...content, description: FULLSCREEN_WINDOW_DESCRIPTION }
    : content;
}

function stableId(control: DeckControl): string {
  // Preserve the public automation hook established before copy-link entered the registry.
  return control.action === 'copy-link' ? 'copy-reference' : control.action;
}

function keysFor(control: DeckControl): string | undefined {
  const keys = control.keys.map((key) => key.label).filter(Boolean);
  return keys.length > 0 ? keys.join(', ') : undefined;
}

async function activate(control: DeckControl): Promise<void> {
  const action = actionFor(control);
  if (action === 'copy-link') {
    const ok = await copyText(reference());
    if (oncopied) {
      oncopied(ok);
      return;
    }
    clearTimeout(copyTimer);
    copyStatus = ok ? 'copied' : 'failed';
    copyTimer = setTimeout(() => (copyStatus = 'idle'), 2_500);
    return;
  }
  if (action === 'jump') {
    jumpOpen = !jumpOpen;
    return;
  }
  onaction(action);
}

function selectSlide(slideId: string): void {
  jumpOpen = false;
  onjump(slideId);
  queueMicrotask(() => jumpButton?.focus());
}

function attachJump(node: HTMLElement): () => void {
  jumpButton = node as HTMLButtonElement;
  return () => {
    if (jumpButton === node) jumpButton = undefined;
  };
}

function attachControl(control: DeckControl): (node: HTMLElement) => undefined | (() => void) {
  return control.action === 'jump' ? attachJump : () => undefined;
}

$effect(() => {
  if (typeof window === 'undefined') return;
  const query = window.matchMedia('(max-width: 639px)');
  const update = () => (compact = query.matches);
  update();
  query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
});

$effect(() => {
  if (blackout || laser) tooltip.hide();
});

$effect(() => () => {
  clearTimeout(copyTimer);
  tooltip.destroy();
});
</script>

{#snippet controlButton(control: DeckControl, mobile: boolean)}
  {@const action = actionFor(control)}
  {@const isJump = action === 'jump'}
  {@const active = pressed(action)}
  <button
    type="button"
    class={`${buttonClass} ${mobile ? 'w-full justify-start' : ''} ${control.toggle && active ? 'ring-1 ring-primary' : ''}`}
    aria-label={isJump ? `${control.label}, ${currentOrdinal} of ${slides.length}` : control.label}
    aria-pressed={control.toggle ? active : undefined}
    aria-expanded={action === 'help' ? help : isJump ? jumpOpen : undefined}
    aria-controls={action === 'help' ? helpId : isJump ? 'py-deck-slide-list' : undefined}
    aria-haspopup={isJump ? 'listbox' : undefined}
    aria-keyshortcuts={keysFor(control)}
    data-py-deck-tool={stableId(control)}
    data-py-print-button={control.action === 'print' ? true : undefined}
    {@attach tooltip.anchor(() => tooltipFor(control))}
    {@attach attachControl(control)}
    onkeydown={(event) => {
      if (isJump && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        jumpOpen = !jumpOpen;
      }
    }}
    onclick={() => void activate(control)}
  >
    {#if isJump}
      {@const title = `${currentOrdinal} / ${slides.length}`}
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        {#each DECK_ICON_PATHS[control.icon] as path (path)}<path d={path}></path>{/each}
      </svg>
      <span data-py-deck-jump-count>{title}</span>
      <span class="sr-only">{control.label}</span>
    {:else}
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        {#each DECK_ICON_PATHS[control.icon] as path (path)}<path d={path}></path>{/each}
      </svg>
      <span class={mobile ? '' : 'hidden sm:inline'}>{control.label}</span>
      {#if control.toggle && active}<span class="rounded border border-current px-1 text-[10px] uppercase tracking-wide">On</span>{/if}
    {/if}
  </button>
{/snippet}

<div class="pointer-events-auto relative flex shrink-0 items-center gap-1" role="toolbar" aria-label="Deck controls" data-py-deck-toolbar>
  <div class="flex items-center gap-1" role="group" aria-label="Navigate" data-py-deck-control-group="navigate">
    {#each navControls as control (control.action)}
      {#if !compact || (control.action !== 'first' && control.action !== 'last')}
        {@render controlButton(control, false)}
      {/if}
      {#if control.action === 'jump' && jumpOpen}
        <div id="py-deck-slide-list" class="fixed bottom-16 right-3 z-[100] max-h-[min(60vh,28rem)] w-64 overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg" role="listbox" aria-label="Choose a slide" data-py-deck-slide-list>
          {#each slides as slide, index (slide.id)}
            <button
              type="button"
              role="option"
              aria-selected={index + 1 === currentOrdinal}
              class="block min-h-11 w-full rounded px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              onclick={() => selectSlide(slide.id)}
            >
              <span class="mr-2 text-muted-foreground">{index + 1}.</span>{slide.title ?? ('props' in slide && typeof slide.props.title === 'string' ? slide.props.title : slide.id)}
            </button>
          {/each}
        </div>
      {/if}
    {/each}
  </div>

  {#if !compact}
    {#each DECK_CONTROL_GROUPS.filter((group) => group === 'view' || group === 'present' || group === 'share' || group === 'help' || group === 'debug') as group (group)}
      {@const groupControls = controls.filter((control) => control.group === group && control.action !== 'jump')}
      {#if groupControls.length > 0}
        <div class="ml-1 flex items-center gap-1 border-l border-border pl-1" role="group" aria-label={group[0]!.toUpperCase() + group.slice(1)} data-py-deck-control-group={group}>
          {#each groupControls as control (control.action)}
            {@render controlButton(control, false)}
          {/each}
        </div>
      {/if}
    {/each}
  {:else}
    <MoreMenu controls={mobileSecondaryControls}>
      {#snippet children(control)}{@render controlButton(control, true)}{/snippet}
    </MoreMenu>
  {/if}

  <ChromeTooltip {tooltip} />
  {#if !oncopied}
    <span class="sr-only" role="status" aria-live="polite" data-py-deck-copy-status>
      {copyStatus === 'copied' ? 'Link copied' : copyStatus === 'failed' ? 'Could not copy the link' : ''}
    </span>
  {/if}
</div>
