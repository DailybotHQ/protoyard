<script lang="ts" generics="T extends import('@protoyard/views/files').FileEntry">
/**
 * A gallery of files that opens each one in an accessible lightbox (the
 * `@protoyard/ui` Dialog over Texuli's): images, PDFs, text, video and audio
 * preview by type; anything else shows its details. Previous / Next buttons
 * and ArrowLeft / ArrowRight step through the files, Escape closes, and focus
 * returns to the thumbnail of the file that was showing.
 *
 * Sources come from the host: `getSrc` (a URL, checked by `safePreviewSrc`),
 * `getBlob` (an object URL, or the text of a text file) or `getText`. Text is
 * rendered as text, never as HTML.
 */

import { Button, Dialog } from '@protoyard/ui';
import { formatSize, thumbnailUrl } from '@protoyard/views/files';
import { tick } from 'svelte';
import { clipPreviewText, type FilePreviewKind, previewKind, safePreviewSrc } from './preview.ts';

let {
  entries,
  current = $bindable<string | null>(null),
  onCurrentChange,
  getSrc,
  getBlob,
  getText,
  label = 'File preview',
  class: className,
}: {
  /** Files to preview, in order; folders are skipped. */
  entries: readonly T[];
  /** Id of the file open in the lightbox (`null` = closed). Bindable. */
  current?: string | null;
  onCurrentChange?: (id: string | null) => void;
  /** A URL for the file (image, PDF, video, audio); unsafe URLs are ignored. */
  getSrc?: (entry: T) => string | undefined;
  /** The stored bytes: shown through an object URL, or read as text for text files. */
  getBlob?: (entry: T) => Promise<Blob | undefined>;
  /** The contents of a text file (wins over `getBlob` for text). */
  getText?: (entry: T) => string | undefined | Promise<string | undefined>;
  label?: string;
  class?: string;
} = $props();

const files = $derived(entries.filter((entry) => entry.kind === 'file'));
const index = $derived(current === null ? -1 : files.findIndex((entry) => entry.id === current));
const entry = $derived(index >= 0 ? files[index] : undefined);
const kind = $derived<FilePreviewKind>(entry ? previewKind(entry) : 'other');
let open = $state(false);
let lastShown: string | null = null;
let gallery = $state<HTMLElement | null>(null);

$effect(() => {
  open = entry !== undefined;
  if (entry) lastShown = entry.id;
});

function show(id: string | null): void {
  current = id;
  onCurrentChange?.(id);
}

function step(direction: -1 | 1): void {
  const next = files[index + direction];
  if (next) show(next.id);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
  }
}

async function returnFocus(event: { preventDefault(): void }): Promise<void> {
  const id = lastShown;
  const list = gallery;
  if (!id || !list) return;
  event.preventDefault();
  await tick();
  list.querySelector<HTMLElement>(`[data-file-preview-item="${CSS.escape(id)}"]`)?.focus();
}

function thumbSrc(file: T): string {
  const host = previewKind(file) === 'image' ? safePreviewSrc(getSrc?.(file), 'image') : undefined;
  return host ?? thumbnailUrl(file, { size: 96 });
}

// The open file's source: a host URL, else an object URL from its blob; text is read.
let blobSrc = $state<string | undefined>(undefined);
let text = $state<{ text: string; omitted: number } | null>(null);
let loading = $state(false);
let failed = $state(false);
const hostSrc = $derived(entry ? safePreviewSrc(getSrc?.(entry), kind) : undefined);
const src = $derived(hostSrc ?? blobSrc);

$effect(() => {
  const file = entry;
  const fileKind = kind;
  blobSrc = undefined;
  text = null;
  failed = false;
  if (!file) return;
  let alive = true;
  let objectUrl: string | undefined;
  const wantsText = fileKind === 'text';
  const wantsBlobUrl = !wantsText && fileKind !== 'other' && !hostSrc && getBlob !== undefined;
  if (!wantsText && !wantsBlobUrl) return;
  loading = true;
  (async () => {
    if (wantsText) {
      const value = getText ? await getText(file) : await (await getBlob?.(file))?.text();
      if (alive && value !== undefined) text = clipPreviewText(value);
    } else {
      const blob = await getBlob?.(file);
      if (alive && blob && typeof URL.createObjectURL === 'function') {
        objectUrl = URL.createObjectURL(blob);
        blobSrc = objectUrl;
      }
    }
  })()
    .catch(() => {
      if (alive) failed = true;
    })
    .finally(() => {
      if (alive) loading = false;
    });
  return () => {
    alive = false;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
});

const details = $derived(
  entry
    ? [
        entry.type ?? kind,
        formatSize(entry.size),
        entry.updatedAt ? entry.updatedAt.slice(0, 10) : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
);
</script>

<section class={['py-file-preview', className]} aria-label={label} data-file-preview>
  {#if files.length === 0}
    <p class="py-file-preview__empty">No files to preview.</p>
  {:else}
    <ul class="py-file-preview__grid" bind:this={gallery}>
      {#each files as file (file.id)}
        <li>
          <button
            type="button"
            class="py-file-preview__item"
            data-file-preview-item={file.id}
            aria-haspopup="dialog"
            onclick={() => show(file.id)}
          >
            <img src={thumbSrc(file)} alt="" width="96" height="96" loading="lazy" />
            <span class="py-file-preview__name">{file.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if files.length > 0}
  <Dialog
    bind:open
    title={entry?.name ?? label}
    description={details}
    size="xl"
    onOpenChange={(next) => {
      if (!next) show(null);
    }}
    onCloseAutoFocus={returnFocus}
  >
    {#if entry}
    <!-- svelte-ignore a11y_no_static_element_interactions -- arrow keys page the lightbox; the buttons below are the pointer and keyboard path. -->
    <div class="py-file-preview__lightbox" data-file-lightbox={kind} onkeydown={onKeydown}>
      <div class="py-file-preview__stage">
        {#if loading}
          <p role="status">Loading preview…</p>
        {:else if failed}
          <p role="alert">This preview could not be loaded.</p>
        {:else if kind === 'image'}
          <img class="py-file-preview__image" src={src ?? thumbnailUrl(entry, { size: 320 })} alt={entry.name} />
        {:else if kind === 'pdf' && src}
          <object class="py-file-preview__pdf" data={src} type="application/pdf" title={entry.name}>
            <p>This browser cannot show the PDF inline. <a href={src} target="_blank" rel="noopener noreferrer">Open {entry.name}</a></p>
          </object>
        {:else if kind === 'video' && src}
          <!-- svelte-ignore a11y_media_has_caption -- fictional host media; captions are the host's to provide. -->
          <video class="py-file-preview__media" src={src} controls></video>
        {:else if kind === 'audio' && src}
          <audio src={src} controls></audio>
        {:else if kind === 'text' && text}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a scrollable region must be reachable by keyboard. -->
          <pre class="py-file-preview__text" tabindex="0" aria-label={`${entry.name} contents`}>{text.text}</pre>
          {#if text.omitted > 0}
            <p class="py-file-preview__note">{text.omitted.toLocaleString('en-US')} more characters not shown.</p>
          {/if}
        {:else}
          <img src={thumbnailUrl(entry, { size: 160 })} alt="" width="160" height="160" />
          <p class="py-file-preview__note">No preview for this file type.</p>
        {/if}
      </div>
      <div class="py-file-preview__nav">
        <Button type="button" variant="outline" size="sm" disabled={index <= 0} onclick={() => step(-1)}>
          <span aria-hidden="true">←</span> Previous
        </Button>
        <span class="py-file-preview__position" aria-live="polite">{index + 1} of {files.length}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={index >= files.length - 1}
          onclick={() => step(1)}
        >
          Next <span aria-hidden="true">→</span>
        </Button>
      </div>
    </div>
    {/if}
  </Dialog>
{/if}

<style>
  .py-file-preview__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
    gap: var(--tx-space-3, 0.75rem);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .py-file-preview__item {
    display: grid;
    justify-items: center;
    gap: var(--tx-space-2, 0.5rem);
    inline-size: 100%;
    border: var(--tx-border-width-thin, 1px) solid var(--tx-border, ButtonBorder);
    border-radius: var(--tx-shape-radius-md, 0.375rem);
    padding: var(--tx-space-2, 0.5rem);
    background: var(--tx-card, Canvas);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .py-file-preview__item:focus-visible {
    outline: var(--tx-focus-ring-width, 2px) solid var(--tx-ring, Highlight);
    outline-offset: 2px;
  }
  .py-file-preview__item img {
    inline-size: 96px;
    block-size: 96px;
    object-fit: cover;
    border-radius: var(--tx-shape-radius-sm, 0.25rem);
  }
  .py-file-preview__name {
    max-inline-size: 100%;
    overflow-wrap: anywhere;
    font-size: var(--tx-type-caption-size, 0.8rem);
    text-align: center;
  }
  .py-file-preview__lightbox {
    display: grid;
    gap: var(--tx-space-3, 0.75rem);
  }
  .py-file-preview__stage {
    display: grid;
    place-items: center;
    min-block-size: 12rem;
  }
  .py-file-preview__image,
  .py-file-preview__media {
    max-inline-size: 100%;
    max-block-size: 70vh;
    object-fit: contain;
  }
  .py-file-preview__pdf {
    inline-size: 100%;
    block-size: 70vh;
  }
  .py-file-preview__text {
    inline-size: 100%;
    max-block-size: 60vh;
    overflow: auto;
    margin: 0;
    padding: var(--tx-space-3, 0.75rem);
    border-radius: var(--tx-shape-radius-md, 0.375rem);
    background: var(--tx-muted, ButtonFace);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--tx-type-caption-size, 0.8rem);
  }
  .py-file-preview__nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--tx-space-2, 0.5rem);
  }
  .py-file-preview__position,
  .py-file-preview__note,
  .py-file-preview__empty {
    margin: 0;
    color: var(--tx-muted-foreground, GrayText);
    font-size: var(--tx-type-caption-size, 0.8rem);
  }
</style>
