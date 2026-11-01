import { type Flow, runFlow } from '@protoyard/flows';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FlowEditor from '../src/editor/FlowEditor.svelte';
import KeepsPanel from '../src/keeps/KeepsPanel.svelte';
import OutboxPanel from '../src/outbox/OutboxPanel.svelte';

afterEach(cleanup);

function sampleFlow(): Flow {
  return {
    formatVersion: 1,
    id: 'sample-flow',
    name: 'Review request',
    status: 'active',
    triggers: [{ id: 'manual-start', type: 'manual', label: 'Start review' }],
    collections: [
      {
        id: 'requests',
        noun: 'request',
        states: [{ id: 'new', label: 'New' }],
      },
    ],
    steps: [
      {
        id: 'save-request',
        type: 'save_record',
        collection: 'requests',
        title: 'Laptop request',
        state: 'new',
      },
      {
        id: 'notify-reviewer',
        type: 'message',
        channel: 'chat',
        to: [{ type: 'person', id: 'person_ada', name: 'Ada Example' }],
        text: 'A request needs review.',
      },
    ],
  };
}

describe('FlowEditor', () => {
  it('validates data-only condition JSON before applying it', async () => {
    const flow = sampleFlow();
    flow.steps = [
      {
        id: 'check-approval',
        type: 'branch',
        when: { type: 'test', subject: { from: 'trigger', path: ['approved'] }, test: 'true' },
        // biome-ignore lint/suspicious/noThenProperty: branch steps model a then arm.
        then: [],
        otherwise: [],
      },
    ];
    const onChange = vi.fn();
    const view = render(FlowEditor, { props: { flow, onChange } });
    const editor = view.getByLabelText('Branch condition (JSON)');
    await fireEvent.input(editor, { target: { value: '{not json' } });
    expect(view.getByRole('alert').textContent).toContain('valid JSON condition');
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.input(editor, {
      target: { value: JSON.stringify({ type: 'judge', phrase: 'Needs a human review' }) },
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: [
            expect.objectContaining({ when: { type: 'judge', phrase: 'Needs a human review' } }),
          ],
        }),
        [expect.objectContaining({ op: 'update_step', stepId: 'check-approval' })]
      )
    );
  });
});

describe('KeepsPanel and OutboxPanel', () => {
  it('renders engine keeps and a masked outbox as inert text', () => {
    const result = runFlow(sampleFlow(), { now: '2026-03-15T10:00:00.000Z', seed: 5 });
    const keeps = render(KeepsPanel, { props: { result } });
    expect(keeps.getByRole('heading', { name: 'Keeps' })).toBeTruthy();
    expect(keeps.getByText('Laptop request')).toBeTruthy();
    keeps.unmount();

    const outbox = render(OutboxPanel, { props: { items: result.outbox } });
    expect(outbox.getByRole('heading', { name: 'Outbox preview' })).toBeTruthy();
    expect(outbox.getByText('A request needs review.')).toBeTruthy();
    expect(outbox.queryByRole('link')).toBeNull();
  });
});
