<script lang="ts">
import { Spinner as TexuliSpinner } from 'texuli/feedback';

/** Small inline spinner for panel controls (still under reduced motion). */
let { class: className = '' }: { class?: string } = $props();
</script>

<TexuliSpinner size="sm" class={className} />
