<script lang="ts">
import type { CustomSlideProps } from '../../src/layouts/custom-slides.ts';

let { data }: CustomSlideProps = $props();
const value = $derived.by(() => {
  if (data.fail) throw new Error('fixture failure');
  return 'fine';
});
</script>

<p>{value}</p>
