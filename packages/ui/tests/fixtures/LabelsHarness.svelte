<script lang="ts">
import type { Component } from 'svelte';
import { LabelsProvider } from 'texuli/i18n';

// Renders one component inside Texuli's label dictionary (what mountPrototype({ i18n }) sets up).
let {
  component: Inner,
  innerProps = {},
  labels = {},
}: {
  // biome-ignore lint/suspicious/noExplicitAny: a test harness takes any component.
  component: Component<any>;
  innerProps?: Record<string, unknown>;
  labels?: Record<string, string>;
} = $props();
</script>

<LabelsProvider {labels} locale="es">
  <Inner {...innerProps} />
</LabelsProvider>
