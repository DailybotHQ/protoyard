<script lang="ts">
/**
 * Lightweight stand-in for DeckLayoutRenderer in DeckApp tests.
 */
let {
  layout,
  props,
}: {
  layout: string;
  props: unknown;
} = $props();

const title = $derived(
  props && typeof props === 'object' && props !== null && 'title' in props
    ? String((props as { title?: unknown }).title ?? layout)
    : layout
);
</script>

<div class="grid h-full place-items-center p-8 text-[24px]" data-py-mock-layout={layout}>
  <p>{title}</p>
</div>
