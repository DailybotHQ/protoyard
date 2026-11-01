<script lang="ts">
import {
  type DocConversionNote,
  type DocDocument,
  docToTexuliDocument,
  texuliDocumentToDoc,
} from '@protoyard/pages';
import { Button, Notice } from '@protoyard/ui';
import type { TexuliDocument } from '@texuli/document/model';
import { PageEditor, type PagesLabels } from '@texuli/pages/editor';
import { untrack } from 'svelte';

/**
 * Edits a doc with the `@texuli/pages` editor: text through
 * `@texuli/editor`, the slash menu, block reordering by pointer or
 * keyboard, and undo and redo on the `@texuli/document` op log. Protoyard
 * blocks (charts, tables, forms, embedded apps…) show as labelled
 * placeholders that can be moved or removed; their content stays in the
 * blueprint. Applying converts the Texuli document back to the doc body
 * (`texuliDocumentToDoc`), so forms and interactive blocks keep working,
 * and hands it to DocApp, which saves it when the doc has a runtime.
 * Loaded on first use (its own chunk).
 */
let {
  doc,
  onApply,
  onCancel,
}: {
  doc: DocDocument;
  /** The edited doc and what the conversion could not keep; a promise keeps Apply pending. */
  onApply: (next: DocDocument, notes: DocConversionNote[]) => void | Promise<void>;
  onCancel: () => void;
} = $props();

const start = untrack(() => docToTexuliDocument(doc, { mode: 'edit' }).document);
let draft = $state.raw<TexuliDocument>(start);
let changed = $state(false);
let issues = $state<string[]>([]);

const labels: Partial<PagesLabels> = {
  embed: (_kind, title) => title,
  untrusted: 'Protoyard block',
  refused:
    'Shown in the reading view. Move or remove it here; change its content in the blueprint.',
};

async function apply(): Promise<void> {
  const result = texuliDocumentToDoc(draft, doc);
  if (!result.ok) {
    issues = result.issues.slice(0, 5);
    return;
  }
  issues = [];
  try {
    await onApply(result.doc, result.notes);
  } catch (error) {
    issues = [errorText(error)];
  }
}

/** A refused save in plain words: the service's field messages, else its message. */
function errorText(error: unknown): string {
  const fields = (error as { issues?: Record<string, string> } | null)?.issues;
  const first = fields ? Object.values(fields).find((text) => typeof text === 'string') : undefined;
  if (first) return first;
  return error instanceof Error && error.message ? error.message : 'The edits could not be saved.';
}
</script>

<section class="doc-editor" data-py-doc-editor aria-label={`Edit ${doc.title}`}>
  <div class="doc-editor__bar">
    <p class="doc-editor__hint">
      Type <kbd>/</kbd> in an empty line for blocks. Drag a handle, or press
      <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd>, to reorder.
    </p>
    <div class="doc-editor__actions">
      <Button variant="ghost" size="sm" data-py-doc-editor-cancel onclick={onCancel}>Discard</Button>
      <Button size="sm" data-py-doc-editor-apply disabled={!changed} onclick={() => apply()}>
        Apply changes
      </Button>
    </div>
  </div>

  {#if issues.length > 0}
    <Notice
      tone="error"
      title="These changes can't be applied"
      text={issues.join(' · ')}
      data-py-doc-editor-issues
    />
  {/if}

  <PageEditor
    document={start}
    label={`${doc.title} (editing)`}
    {labels}
    components={[]}
    onChange={(next) => {
      draft = next;
      changed = true;
    }}
  />
</section>

<style>
  .doc-editor {
    display: grid;
    gap: 1rem;
    margin-inline: auto;
    max-width: 72ch;
    min-width: 0;
    padding: clamp(1.25rem, 4vw, 3rem) clamp(1rem, 4vw, 2rem);
  }

  .doc-editor__bar {
    align-items: center;
    border-bottom: 1px solid var(--tx-border);
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: space-between;
    padding-bottom: 0.75rem;
  }

  .doc-editor__hint {
    color: var(--tx-muted-foreground);
    font-size: 0.8125rem;
    margin: 0;
  }

  .doc-editor__actions {
    display: flex;
    gap: 0.5rem;
  }

  kbd {
    border: 1px solid var(--tx-border);
    border-radius: 0.25rem;
    font-family: var(--tx-font-mono, ui-monospace, monospace);
    font-size: 0.75rem;
    padding: 0 0.25rem;
  }
</style>
