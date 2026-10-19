<script lang="ts">
import type { Snippet } from 'svelte';

let {
  label,
  children,
  min = '12rem',
  class: className = '',
}: { label: string; children: Snippet; min?: string; class?: string } = $props();
</script>

<!-- Tiles wrap to fit the container (works inside device shells): one per row on a phone, a row on a desktop. -->
<section
  aria-label={label}
  class="grid gap-3 sm:gap-4 {className}"
  style:grid-template-columns="repeat(auto-fit, minmax(min(100%, {min}), 1fr))"
>
  {@render children()}
</section>
