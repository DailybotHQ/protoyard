<script lang="ts">
import { LabelsProvider } from 'texuli/i18n';
import PresentationToggle from '../../src/adaptive/PresentationToggle.svelte';
import type { AdaptivePresentationStore } from '../../src/adaptive/presentation.svelte.ts';

let { store }: { store: AdaptivePresentationStore } = $props();
</script>

<LabelsProvider labels={{ 'protoyard.renderer.presentation.desktop': 'Escritorio' }} locale="es">
  <PresentationToggle {store} />
</LabelsProvider>
