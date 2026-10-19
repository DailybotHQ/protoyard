<script lang="ts">
let {
  showing = $bindable(false),
  controls,
}: {
  /** True while the table replaces the chart. */
  showing?: boolean;
  /** Id of the element the toggle shows and hides. */
  controls?: string;
} = $props();
</script>

<button
  type="button"
  class="inline-flex items-center rounded-md px-1.5 py-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
  aria-pressed={showing}
  aria-controls={controls}
  onclick={() => (showing = !showing)}
>
  {showing ? 'View as chart' : 'View as table'}
</button>
