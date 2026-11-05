<script lang="ts">
import type { Component } from 'svelte';
import { LabelsProvider } from 'texuli/i18n';

/** Renders one component inside Texuli's dictionary, as mountPrototype({ i18n }) does. */
let {
  component: Inner,
  props = {},
  labels = {},
  locale = 'es',
}: {
  // biome-ignore lint/suspicious/noExplicitAny: any component under test.
  component: Component<any>;
  props?: Record<string, unknown>;
  labels?: Record<string, string>;
  locale?: string;
} = $props();
</script>

<LabelsProvider {labels} {locale}>
  <Inner {...props} />
</LabelsProvider>
