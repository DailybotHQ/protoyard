<script lang="ts">
import type { CustomSlideProps } from '../../src/layouts/custom-slides.ts';

let { slide, step, stepCount, data }: CustomSlideProps = $props();
let clicks = $state(0);
</script>

<div data-probe>
  <p data-probe-slide>{slide.id}</p>
  <p data-probe-step>{step}/{stepCount}</p>
  <p data-probe-data>{JSON.stringify(data)}</p>
  <p data-probe-keys>{Object.keys(slide).sort().join(',')}</p>
  <button type="button" onclick={() => (clicks += 1)}>Add one</button>
  <p data-probe-clicks>{clicks}</p>
  <div data-probe-surface>Plain area</div>
</div>
