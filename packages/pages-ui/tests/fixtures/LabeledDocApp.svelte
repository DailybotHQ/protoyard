<script lang="ts">
import type { DocDocument } from '@protoyard/pages';
import { LabelsProvider } from 'texuli/i18n';
import DocApp from '../../src/doc/DocApp.svelte';

let { doc, labels }: { doc: DocDocument; labels: Record<string, string> } = $props();
</script>

<LabelsProvider {labels} locale="es">
  <DocApp {doc} />
</LabelsProvider>
