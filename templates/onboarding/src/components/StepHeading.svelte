<script lang="ts">
import { onMount } from 'svelte';
import { Heading, Text } from 'texuli/typography';

/**
 * Step title that takes focus when the step appears, so keyboard and screen
 * reader users land on the new step after Next/Back (and after a reload).
 */
let {
  title,
  description,
  optional = false,
  align = 'start',
}: {
  title: string;
  description: string;
  optional?: boolean;
  /** `center` for a centered step (the finish screen). */
  align?: 'start' | 'center';
} = $props();
let heading = $state<HTMLHeadingElement | null>(null);
onMount(() => heading?.focus({ preventScroll: true }));
</script>

<header class="mb-6">
  <Heading level={1} size="xl" bind:ref={heading} tabindex={-1}>
    {title}
    {#if optional}<Text as="span" size="xs" weight="medium" tone="muted" class="ml-1">(optional)</Text>{/if}
  </Heading>
  <Text size="sm" tone="muted" {align} class="mt-1">{description}</Text>
</header>
