<script lang="ts">
/** Small inline spinner for panel controls (still under reduced motion). */
let { class: className = '' }: { class?: string } = $props();
</script>

<span
  class="inline-block size-3 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none {className}"
  aria-hidden="true"
></span>
