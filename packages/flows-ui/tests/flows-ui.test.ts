import { type Flow, runFlow } from '@protoyard/flows';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FlowEditor from '../src/editor/FlowEditor.svelte';
import KeepsPanel from '../src/keeps/KeepsPanel.svelte';
import OutboxPanel from '../src/outbox/OutboxPanel.svelte';
import RunPanel from '../src/runs/RunPanel.svelte';

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
  it('edits flow and trigger fields through validated operations', async () => {
    const onChange = vi.fn();
    const view = render(FlowEditor, { props: { flow: sampleFlow(), onChange } });

    await fireEvent.input(view.getByLabelText('Name'), { target: { value: 'Updated review' } });
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'Updated review' }),
        [{ op: 'update_flow', patch: { name: 'Updated review' } }]
      )
    );

    await fireEvent.input(view.getByLabelText('Button label'), { target: { value: 'Start now' } });
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ triggers: [expect.objectContaining({ label: 'Start now' })] }),
        [expect.objectContaining({ op: 'replace_trigger', triggerId: 'manual-start' })]
      )
    );

    await fireEvent.input(view.getByLabelText('Message text'), {
      target: { value: 'Updated copy' },
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          steps: expect.arrayContaining([expect.objectContaining({ text: 'Updated copy' })]),
        }),
        [expect.objectContaining({ op: 'update_step', stepId: 'notify-reviewer' })]
      )
    );
  });

  it('keeps the step graph in step with local edits when the host does not pass the flow back', async () => {
    // Uncontrolled: onChange is not written back into the `flow` prop.
    const view = render(FlowEditor, { props: { flow: sampleFlow(), onChange: vi.fn() } });
    const nodes = () => view.container.querySelectorAll('[data-wf-node]').length;
    const before = nodes();
    await fireEvent.click(view.getByRole('button', { name: 'Add reply step' }));
    await waitFor(() => expect(nodes()).toBe(before + 1));
    expect(view.container.textContent).not.toContain('Connect every top-level step');
  });

  it('keeps the last valid flow and reports schema feedback for invalid operations', async () => {
    const onChange = vi.fn();
    const view = render(FlowEditor, { props: { flow: sampleFlow(), onChange } });
    await fireEvent.click(view.getByRole('button', { name: 'Remove trigger' }));
    expect(view.getByRole('status', { name: 'Flow validation feedback' }).textContent).toContain(
      'Add a way to start'
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('edits advanced trigger fields with strict trigger validation', async () => {
    const onChange = vi.fn();
    const view = render(FlowEditor, { props: { flow: sampleFlow(), onChange } });
    await fireEvent.click(view.getByText('Advanced trigger configuration'));
    await fireEvent.input(view.getByLabelText('Trigger definition (JSON)'), {
      target: {
        value: JSON.stringify({
          id: 'manual-start',
          type: 'manual',
          label: 'Start review',
          surfaces: ['app', 'command'],
          command: 'review_request',
        }),
      },
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          triggers: [
            expect.objectContaining({ surfaces: ['app', 'command'], command: 'review_request' }),
          ],
        }),
        [expect.objectContaining({ op: 'replace_trigger', triggerId: 'manual-start' })]
      )
    );
  });

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

describe('RunPanel', () => {
  it('shows pending feedback for an async runner, then the engine result', async () => {
    const flow = sampleFlow();
    const result = runFlow(flow, { now: '2026-03-15T10:00:00.000Z', seed: 5 });
    let resolveRun!: (value: typeof result) => void;
    const onRun = vi.fn(
      () =>
        new Promise<typeof result>((resolve) => {
          resolveRun = resolve;
        })
    );
    const onResult = vi.fn();
    const view = render(RunPanel, { props: { flow, onRun, onResult } });
    const button = view.getByRole('button', { name: 'Run test' });
    await fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    expect(view.getByRole('status').textContent).toContain('Running simulated workflow');
    resolveRun(result);
    await waitFor(() => expect(view.getByText('Latest result')).toBeTruthy());
    expect(view.getByText('done')).toBeTruthy();
    expect(onResult).toHaveBeenCalledWith(result);
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
