<script lang="ts">
import type { DocDocument } from '@protoyard/pages';
import { Button } from '@protoyard/ui';
import type { DocExportFormat, DocExportOutcome } from './doc-export.ts';

/**
 * The doc's tool bar: Edit (when the persona may) and downloads as Word,
 * PDF or Markdown through Texuli's writers. The export module loads on the
 * first click; every button shows pending until its work settles. Hidden
 * when printing.
 */
let {
  doc,
  canEdit = true,
  edited = false,
  saved = false,
  canReset,
  onEdit,
  onReset,
}: {
  doc: DocDocument;
  canEdit?: boolean;
  /** The doc shows edits instead of its original body. */
  edited?: boolean;
  /** Edits are saved for this world (a kind runtime store), not only held in the tab. */
  saved?: boolean;
  /** Show Reset (default: when the doc is edited). */
  canReset?: boolean;
  onEdit?: () => void;
  /** Returning a promise keeps the Reset button pending until it settles. */
  onReset?: () => void | Promise<unknown>;
} = $props();

const showReset = $derived(canReset ?? edited);

const FORMATS: readonly { format: DocExportFormat; label: string }[] = [
  { format: 'docx', label: 'Word' },
  { format: 'pdf', label: 'PDF' },
  { format: 'markdown', label: 'Markdown' },
];

let outcome = $state<DocExportOutcome | null>(null);
let failure = $state<string | null>(null);

function sizeLabel(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

async function download(format: DocExportFormat): Promise<void> {
  failure = null;
  try {
    const { exportDoc } = await import('./doc-export.ts');
    outcome = await exportDoc(doc, format);
  } catch (error) {
    outcome = null;
    failure = error instanceof Error ? error.message : 'The file could not be written.';
  }
}
</script>

<div class="doc-tools" data-py-doc-tools>
  <div class="doc-tools__row">
    {#if canEdit && onEdit}
      <Button variant="outline" size="sm" data-py-doc-edit onclick={onEdit}>Edit</Button>
    {/if}
    {#if showReset && onReset}
      <Button variant="ghost" size="sm" data-py-doc-reset onclick={() => onReset()}>
        Reset to the original
      </Button>
    {/if}
    <div class="doc-tools__downloads" role="group" aria-label="Download">
      <span class="doc-tools__label" aria-hidden="true">Download</span>
      {#each FORMATS as item (item.format)}
        <Button
          variant="ghost"
          size="sm"
          data-py-doc-export={item.format}
          aria-label={`Download as ${item.label}`}
          onclick={() => download(item.format)}
        >
          {item.label}
        </Button>
      {/each}
    </div>
  </div>
  {#if edited}
    <p class="doc-tools__hint" data-py-doc-edited>
      {saved
        ? 'Edits are saved in this browser for this world. Reset to go back to the original.'
        : 'Edits stay in this tab until you reload or reset. Download to keep a copy.'}
    </p>
  {/if}
  <p class="doc-tools__status" role="status" data-py-doc-export-status>
    {#if outcome}
      Saved {outcome.filename} ({sizeLabel(outcome.size)}{outcome.pageCount !== undefined
        ? `, ${outcome.pageCount} ${outcome.pageCount === 1 ? 'page' : 'pages'}`
        : ''}).
      {#each outcome.notes as note (note)}
        <span class="doc-tools__note"> {note}</span>
      {/each}
    {/if}
  </p>
  {#if failure}
    {#await import('./DocNotice.svelte') then { default: DocNotice }}
      <DocNotice tone="error" title="The download failed" text={failure} data-py-doc-export-error />
    {/await}
  {/if}
</div>

<style>
  .doc-tools {
    display: grid;
    gap: 0.35rem;
    margin-inline: auto;
    max-width: 76rem;
    padding: 0.75rem clamp(1rem, 4vw, 2rem) 0;
  }

  .doc-tools__row {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .doc-tools__downloads {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .doc-tools__label {
    color: var(--tx-muted-foreground);
    font-size: 0.8125rem;
    margin-inline-end: 0.25rem;
  }

  .doc-tools__hint,
  .doc-tools__status {
    color: var(--tx-muted-foreground);
    font-size: 0.8125rem;
    margin: 0;
    text-align: end;
  }

  @media print {
    .doc-tools {
      display: none !important;
    }
  }
</style>
