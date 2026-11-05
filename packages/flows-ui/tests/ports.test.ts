import { runFlow } from '@protoyard/flows';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Flow, type FlowsPort, flowsPortFromEngine } from '../src/ports.ts';
import RunPanel from '../src/runs/RunPanel.svelte';

afterEach(cleanup);

/**
 * ADR-046 / Dailybot G-030: a product drives the flows kit with its own
 * services. Its domain model ("automations") maps to plain `Flow` data, and
 * its own runner is the `FlowsPort`.
 */
const automation = {
  key: 'standup-reminder',
  title: 'Stand-up reminder',
  recipient: 'Ada Example',
};

function toFlow(a: typeof automation): Flow {
  return {
    formatVersion: 1,
    id: a.key,
    name: a.title,
    status: 'active',
    triggers: [{ id: 'manual-start', type: 'manual', label: 'Start' }],
    collections: [],
    steps: [
      {
        id: 'notify',
        type: 'message',
        channel: 'chat',
        to: [{ type: 'person', id: 'person_ada', name: a.recipient }],
        text: 'Time for the stand-up.',
      },
    ],
  };
}

describe('flows-ui on a product port', () => {
  it("runs through the product's port, not the simulated engine", async () => {
    const flow = toFlow(automation);
    const canned = await runFlow(flow, {});
    const port: FlowsPort = { run: vi.fn(async () => canned) };
    const onResult = vi.fn();
    render(RunPanel, { props: { flow, port, onResult } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run test' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(canned));
    expect(port.run).toHaveBeenCalledWith(flow, {});
  });

  it('shows a failing port as an error, never a fake success', async () => {
    const port: FlowsPort = {
      run: async () => {
        throw new Error('The automation service is unavailable.');
      },
    };
    const onResult = vi.fn();
    render(RunPanel, { props: { flow: toFlow(automation), port, onResult } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run test' }));
    expect(await screen.findByText('The automation service is unavailable.')).toBeTruthy();
    expect(onResult).not.toHaveBeenCalled();
  });

  it('wraps the simulated engine as one port implementation', async () => {
    const result = await flowsPortFromEngine().run(toFlow(automation), {});
    expect(result.run.path.length).toBeGreaterThan(0);
  });
});
