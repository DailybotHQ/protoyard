/**
 * `@protoyard/flows-ui/ports` — what a product implements to drive the flows
 * kit with its own services (ADR-046, ports not runtimes). The screens take
 * plain data (`Flow`, `FlowRunResult`, `OutboxItem`) and callbacks; the one
 * service they need is a runner. `flowsPortFromEngine()` is Protoyard's own
 * simulated runner, the default `RunPanel` uses when no port is given.
 */
import { type Flow, type FlowRunResult, type FlowRuntimeOptions, runFlow } from '@protoyard/flows';

export type {
  Condition,
  Flow,
  FlowOperation,
  FlowRunResult,
  FlowRuntimeOptions,
  OutboxItem,
  Step,
  Trigger,
} from '@protoyard/flows';

/** Runs a flow (a product's workflow service, or the simulated engine). */
export interface FlowsPort {
  run(flow: Flow, options: FlowRuntimeOptions): FlowRunResult | Promise<FlowRunResult>;
}

/** Protoyard's simulated runner as a port. */
export function flowsPortFromEngine(): FlowsPort {
  return { run: (flow, options) => runFlow(flow, options) };
}
