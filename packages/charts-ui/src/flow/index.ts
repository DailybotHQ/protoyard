import type { ChartFamily } from '../families.ts';

export const FAMILY = 'flow' satisfies ChartFamily;

export {
  type FlowChartLabels,
  FunnelChart,
  type FunnelStepInput,
  NetworkGraph,
  type NetworkLinkInput,
  type NetworkNodeInput,
  SankeyChart,
  type SankeyLinkInput,
  type SankeyNodeInput,
} from '@texuli/charts/flow';
