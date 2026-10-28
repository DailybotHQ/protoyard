import type { Flow, FlowOperation, Step } from '@protoyard/flows/model';
import {
  createWorkflow,
  defineNodeTypes,
  type NodeTypeRegistry,
  type WorkflowEdge,
  type WorkflowGraph,
} from '@texuli/workflows/model';

const FLOW_STEP_TYPE = 'protoyard_flow_step';

function sequenceEdges(nodes: readonly { id: string }[], prefix: string): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  for (let index = 0; index + 1 < nodes.length; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];
    if (!from || !to) continue;
    edges.push({
      id: `${prefix}-${index + 1}`,
      from: { node: from.id, port: 'out' },
      to: { node: to.id, port: 'in' },
    });
  }
  return edges;
}

export const flowStepRegistry: NodeTypeRegistry = defineNodeTypes([
  {
    type: FLOW_STEP_TYPE,
    label: 'Flow step',
    category: 'Steps',
    ports: [
      { id: 'in', direction: 'in', dataType: 'step', cardinality: 'one' },
      { id: 'out', direction: 'out', dataType: 'step', cardinality: 'one' },
    ],
  },
]);

function graphNodeId(stepId: string): string {
  return `flow-step-${stepId}`;
}

/** A serializable graph view of top-level flow order; branch contents stay in their step data. */
export function graphForFlow(flow: Flow, previous?: WorkflowGraph): WorkflowGraph {
  const positions = new Map(previous?.nodes.map((node) => [node.id, node.position]) ?? []);
  const graph = createWorkflow({ cycles: 'forbid', metadata: { flowId: flow.id } });
  const nodes = flow.steps.map((step, index) => ({
    id: graphNodeId(step.id),
    type: FLOW_STEP_TYPE,
    label: step.label?.trim() || `${index + 1}. ${step.type.replaceAll('_', ' ')}`,
    position: positions.get(graphNodeId(step.id)) ?? { x: index * 240, y: 0 },
  }));
  const edges = sequenceEdges(nodes, 'flow-order');
  return { ...graph, nodes, edges };
}

/** Only accept a single path containing every current top-level step once. */
export function orderedStepIds(graph: WorkflowGraph, flow: Flow): string[] | null {
  const ids = new Set(flow.steps.map((step) => graphNodeId(step.id)));
  if (graph.nodes.length !== ids.size || graph.nodes.some((node) => !ids.has(node.id))) return null;
  if (graph.edges.length !== Math.max(0, graph.nodes.length - 1)) return null;

  const incoming = new Map<string, string>();
  const outgoing = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.from.port !== 'out' || edge.to.port !== 'in') return null;
    if (outgoing.has(edge.from.node) || incoming.has(edge.to.node)) return null;
    outgoing.set(edge.from.node, edge.to.node);
    incoming.set(edge.to.node, edge.from.node);
  }

  const start = graph.nodes.find((node) => !incoming.has(node.id));
  if (!start) return graph.nodes.length === 0 ? [] : null;
  const ordered = [start.id];
  while (true) {
    const last = ordered[ordered.length - 1];
    if (last === undefined) return null;
    const next = outgoing.get(last);
    if (next === undefined) break;
    ordered.push(next);
  }
  if (ordered.length !== graph.nodes.length || new Set(ordered).size !== graph.nodes.length)
    return null;
  return ordered.map((id) => id.slice('flow-step-'.length));
}

/** Produce validated engine operations that reorder only top-level steps. */
export function reorderOperations(flow: Flow, orderedIds: readonly string[]): FlowOperation[] {
  const steps = [...flow.steps];
  const operations: FlowOperation[] = [];
  for (const [index, desiredId] of orderedIds.entries()) {
    const currentIndex = steps.findIndex((step) => step.id === desiredId);
    if (currentIndex < 0 || currentIndex === index) continue;
    const [step] = steps.splice(currentIndex, 1);
    if (!step) continue;
    steps.splice(index, 0, step);
    operations.push({ op: 'move_step', stepId: desiredId, index });
  }
  return operations;
}

export function graphValidation(graph: WorkflowGraph, flow: Flow) {
  const valid = orderedStepIds(graph, flow) !== null;
  return {
    ok: valid,
    diagnostics: valid
      ? []
      : [
          'Connect every top-level step into one sequence. Add and remove steps with the flow controls.',
        ],
  };
}

export function graphForLabels(labels: readonly string[]): WorkflowGraph {
  const graph = createWorkflow({ cycles: 'forbid' });
  const nodes = labels.map((label, index) => ({
    id: `trace-step-${index + 1}`,
    type: FLOW_STEP_TYPE,
    label: label || `Step ${index + 1}`,
    position: { x: index * 240, y: 0 },
  }));
  const edges = sequenceEdges(nodes, 'trace-edge');
  return { ...graph, nodes, edges };
}

export function stepNames(flow: Flow): string[] {
  return flow.steps.map((step: Step) => step.label?.trim() || step.type.replaceAll('_', ' '));
}
