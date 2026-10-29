import { applyOperations, type Flow } from '@protoyard/flows/model';
import { describe, expect, it } from 'vitest';
import {
  flowStepRegistry,
  graphForFlow,
  graphInSync,
  graphValidation,
  orderedStepIds,
  reorderOperations,
} from '../src/editor/workflow-graph.ts';

const flow: Flow = {
  formatVersion: 1,
  id: 'review-request',
  name: 'Review request',
  status: 'active',
  triggers: [{ id: 'start', type: 'manual', label: 'Start' }],
  collections: [{ id: 'requests', noun: 'request', states: [{ id: 'new', label: 'New' }] }],
  steps: [
    { id: 'save', type: 'save_record', collection: 'requests', title: 'A request' },
    {
      id: 'notify',
      type: 'message',
      channel: 'chat',
      to: [{ type: 'person', id: 'reviewer', name: 'Reviewer' }],
      text: 'Review this request',
    },
  ],
};

describe('workflow graph adapter', () => {
  it('turns graph reordering into validated flow operations without losing step data', () => {
    const graph = graphForFlow(flow);
    const reordered = {
      ...graph,
      edges: [
        {
          id: 'reordered-edge',
          from: { node: 'flow-step-notify', port: 'out' },
          to: { node: 'flow-step-save', port: 'in' },
        },
      ],
    };

    expect(orderedStepIds(reordered, flow)).toEqual(['notify', 'save']);
    expect(graphValidation(reordered, flow).ok).toBe(true);

    const operations = reorderOperations(flow, ['notify', 'save']);
    const result = applyOperations(flow, operations);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.flow.steps.map((step) => step.id)).toEqual(['notify', 'save']);
    expect(result.flow.steps[0]).toMatchObject({ type: 'message', text: 'Review this request' });
    expect(result.flow.steps[1]).toMatchObject({ type: 'save_record', title: 'A request' });
  });

  it('rejects graphs that omit or disconnect a flow step', () => {
    const graph = graphForFlow(flow);
    expect(graphValidation({ ...graph, edges: [] }, flow).ok).toBe(false);
    expect(
      orderedStepIds({ ...graph, nodes: graph.nodes.slice(0, 1), edges: [] }, flow)
    ).toBeNull();
    expect(flowStepRegistry.has('protoyard_flow_step')).toBe(true);
  });

  it('knows when the graph no longer shows the flow steps', () => {
    const graph = graphForFlow(flow);
    expect(graphInSync(graph, flow)).toBe(true);
    // A reorder is the graph's own edit: still in sync.
    const reversed = { ...flow, steps: [...flow.steps].reverse() };
    expect(graphInSync(graph, reversed)).toBe(true);
    // A step added, removed or renamed is not.
    expect(graphInSync(graph, { ...flow, steps: flow.steps.slice(0, 1) })).toBe(false);
    const renamed = {
      ...flow,
      steps: flow.steps.map((step, index) => (index === 0 ? { ...step, label: 'Store it' } : step)),
    };
    expect(graphInSync(graph, renamed)).toBe(false);
  });
});
