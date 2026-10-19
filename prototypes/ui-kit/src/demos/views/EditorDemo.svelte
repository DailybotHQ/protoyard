<script lang="ts">
import { MarkdownEditor } from '@protoyard/views-ui/editor';

let value = $state(
  '# Project update\n\nThe **preview** is rendered from a safe Markdown tree.\n\n- Design review\n- Ship the prototype'
);
let saved = $state('Draft saved locally.');
</script>
<div class="space-y-2"><p class="text-sm text-muted-foreground" aria-live="polite">{saved}</p><MarkdownEditor bind:value label="Project update" layout="split" onDraft={() => (saved = 'Draft saved locally.')} mentions={[{ id: 'ada', value: 'ada.okafor', label: 'Ada Okafor' }]} /></div>
