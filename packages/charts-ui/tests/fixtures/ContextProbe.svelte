<script lang="ts">
import { getChartFrameContext } from '../../src/frame/context.ts';

const frame = getChartFrameContext();
</script>

<output
  data-testid="context"
  data-width={frame?.width}
  data-plot-width={frame?.plot.width}
  data-plot-height={frame?.plot.height}
  data-motion={frame?.reducedMotion ? 'reduce' : 'full'}
  data-mode={frame?.mode}
  data-has-palette={frame?.palette ? 'yes' : 'no'}
></output>
