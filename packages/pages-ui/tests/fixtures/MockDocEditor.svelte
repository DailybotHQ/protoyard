<script lang="ts">
/**
 * Test double for DocEditor: Apply renames the first text block and reports
 * one conversion note, so DocApp's apply, notes and reset paths run without
 * driving the real editor's contenteditable rows.
 */
import type { DocConversionNote, DocDocument } from '@protoyard/pages';

let {
  doc,
  onApply,
  onCancel,
}: {
  doc: DocDocument;
  onApply: (next: DocDocument, notes: DocConversionNote[]) => void;
  onCancel: () => void;
} = $props();

function apply(): void {
  const blocks = doc.blocks.map((block) =>
    block.type === 'text' ? { ...block, markdown: 'Edited in the editor.' } : block
  );
  onApply({ ...doc, blocks }, [
    { id: 'n4', code: 'dropped', message: 'The link to the page "Child" was left out.' },
  ]);
}
</script>

<div data-py-mock-doc-editor>
  <button type="button" onclick={apply}>Mock apply</button>
  <button type="button" onclick={onCancel}>Mock cancel</button>
</div>
