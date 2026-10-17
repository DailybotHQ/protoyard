<script lang="ts">
let { name }: { name: string } = $props();
</script>

<!-- Honest labelling: published prototypes say they are simulations. -->
<div
  class="pointer-events-none fixed bottom-3 left-3 z-30 select-none rounded-full border border-border bg-elevated/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-soft backdrop-blur pb-safe"
  title="{name} is an interactive prototype. Data is simulated and stored only in this browser."
>
  <span class="mr-1 inline-block size-1.5 rounded-full bg-primary align-middle" aria-hidden="true"></span>
  Prototype · simulated data
</div>
