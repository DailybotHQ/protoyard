<script lang="ts">
import { computeFunnel } from '@protoyard/analytics/funnel';
import { FunnelChart } from '@protoyard/charts-ui/part-whole';
import { ACTIVATION_FUNNEL } from '../domain/catalog.ts';
import type { WidgetProps } from './types.ts';

let { title, events }: WidgetProps = $props();
const steps = $derived(computeFunnel(events, ACTIVATION_FUNNEL).steps);
</script>

<FunnelChart {title} {steps} height={220} emptyMessage="Nobody signed up in this period" />
