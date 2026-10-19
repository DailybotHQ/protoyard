<script lang="ts">
import { AVATAR_IDS, nextAvatar } from '@protoyard/blueprint';
import { avatarUrl } from '@protoyard/renderer-svelte';
import { Button, Input } from '@protoyard/ui';
import { tick } from 'svelte';
import RecordAvatar from './RecordAvatar.svelte';

/**
 * Picks a face from the avatar library for an `avatar` field: the current
 * face, "Choose face" (a searchable grid of lazy thumbnails, navigable with
 * the arrow keys, Home and End; Enter or Space picks) and "Shuffle face".
 *
 * Shuffle changes the bound draft value with the deterministic `nextAvatar`
 * walk, unless `onShuffle` is given: then the shuffle is a service call
 * (`EntityService.shuffleAvatar`), the Button shows pending feedback while
 * the returned promise runs, and the saved face becomes the value.
 */
let {
  value = $bindable<unknown>(),
  label,
  id,
  disabled = false,
  required = false,
  error,
  shuffleKey = 'avatar',
  onShuffle,
}: {
  value?: unknown;
  label: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  /** Stable key for draft shuffles (for example `<entity>:new:<field>`). */
  shuffleKey?: string;
  /** Saves a new face through a service and resolves to it (undefined when it failed). */
  onShuffle?: () => Promise<string | null | undefined>;
} = $props();

/** Thumbnails per grid row; ArrowUp and ArrowDown move by this many. */
const COLUMNS = 8;
const uid = $props.id();
const gridId = `${uid}-faces`;

let open = $state(false);
let query = $state('');
let active = $state(0);
let grid = $state<HTMLDivElement | null>(null);

const current = $derived(typeof value === 'string' ? value : null);
const faces = $derived.by(() => {
  // "042" and "av-04" both match av-042: a plain substring of the full id.
  const text = query.trim().toLowerCase();
  return text === '' ? AVATAR_IDS : AVATAR_IDS.filter((face) => face.includes(text));
});

$effect(() => {
  // Keep the roving tab stop on the selected face (or the first match).
  const index = current ? faces.indexOf(current as (typeof faces)[number]) : -1;
  active = index >= 0 ? index : 0;
});

function choose(face: string) {
  if (disabled) return;
  value = face;
}

async function focusFace(index: number) {
  active = Math.max(0, Math.min(faces.length - 1, index));
  await tick();
  grid?.querySelector<HTMLElement>(`[data-face-index="${active}"]`)?.focus();
}

function onFaceKeydown(event: KeyboardEvent) {
  const moves: Record<string, number> = {
    ArrowRight: active + 1,
    ArrowLeft: active - 1,
    ArrowDown: active + COLUMNS,
    ArrowUp: active - COLUMNS,
    Home: 0,
    End: faces.length - 1,
  };
  if (event.key in moves) {
    event.preventDefault();
    void focusFace(moves[event.key] as number);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const face = faces[active];
    if (face) choose(face);
  }
}

function shuffle(): Promise<void> | undefined {
  if (disabled) return undefined;
  if (!onShuffle) {
    value = nextAvatar(current, shuffleKey);
    return undefined;
  }
  return onShuffle().then((saved) => {
    if (typeof saved === 'string') value = saved;
  });
}
</script>

<div class="grid gap-2" data-avatar-picker>
  <div class="flex flex-wrap items-center gap-3">
    <RecordAvatar avatar={current} name={label} size="lg" decorative={false} />
    <span class="text-sm text-muted-foreground" aria-live="polite" data-avatar-current>
      {current ? `Face ${current}` : 'No face yet'}
    </span>
    <Button
      {id}
      type="button"
      size="sm"
      variant="outline"
      {disabled}
      aria-expanded={open}
      aria-controls={gridId}
      aria-label={`${open ? 'Hide faces' : 'Choose face'}: ${label}`}
      aria-invalid={error ? 'true' : undefined}
      onclick={() => (open = !open)}
    >
      {open ? 'Hide faces' : 'Choose face'}
    </Button>
    <Button type="button" size="sm" variant="outline" {disabled} onclick={shuffle}>
      Shuffle face
    </Button>
    {#if current && !required}
      <Button type="button" size="sm" variant="ghost" {disabled} onclick={() => (value = null)}>
        Remove face
      </Button>
    {/if}
  </div>
  {#if onShuffle}
    <p class="text-xs text-muted-foreground">Shuffle face saves the new face right away.</p>
  {/if}

  {#if open}
    <div class="grid gap-2" id={gridId}>
      <Input
        type="search"
        aria-label={`Search ${label.toLowerCase()} faces by id`}
        placeholder="Search by id, for example 042"
        value={query}
        {disabled}
        oninput={(e) => (query = (e.currentTarget as HTMLInputElement).value)}
      />
      {#if faces.length === 0}
        <p class="text-sm text-muted-foreground" role="status">No face matches “{query}”.</p>
      {:else}
        <div
          bind:this={grid}
          role="listbox"
          aria-label={`${label} faces`}
          class="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-2"
          style={`grid-template-columns: repeat(${COLUMNS}, minmax(0, 1fr))`}
        >
          {#each faces as face, index (face)}
            <div
              role="option"
              aria-selected={face === current}
              aria-label={face}
              aria-disabled={disabled || undefined}
              tabindex={index === active ? 0 : -1}
              data-face-index={index}
              data-avatar-id={face}
              class={`flex aspect-square cursor-pointer items-center justify-center rounded-md p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring ${face === current ? 'bg-primary/15 ring-2 ring-primary' : 'hover:bg-muted'}`}
              onclick={() => {
                active = index;
                choose(face);
              }}
              onkeydown={onFaceKeydown}
            >
              <img
                src={avatarUrl(face, 64)}
                alt=""
                loading="lazy"
                decoding="async"
                class="size-full rounded-full object-cover"
              />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
