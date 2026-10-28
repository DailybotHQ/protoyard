import {
  type ApprovalActor,
  type AuditEntry,
  DEFAULT_AUTONOMY,
  type Suggestion,
  type SuggestionTarget,
} from '@protoyard/ai';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuditTrail from '../src/approvals/AuditTrail.svelte';
import AutonomyLevelPicker from '../src/approvals/AutonomyLevelPicker.svelte';
import ChatApprovalCard from '../src/approvals/ChatApprovalCard.svelte';
import SuggestionCard from '../src/approvals/SuggestionCard.svelte';

afterEach(cleanup);

const APPROVER: ApprovalActor = { id: 'person_avery', canApprove: true };
const SUBJECT: ApprovalActor = { id: 'person_oscar', canApprove: false };

function suggestion(over: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'approval_sug_resp_1',
    scopeId: 'org_example',
    kind: 'link_record',
    action: 'apply',
    area: 'records',
    subjectId: SUBJECT.id,
    sourceId: 'resp_1',
    summary: 'Link blocker to ENG-12',
    targetId: 'task_12',
    targetKey: 'ENG-12',
    targetLabel: 'Ship onboarding',
    status: 'pending',
    mode: 'suggest',
    levelAtCreation: 2,
    createdAt: '2026-03-15T10:00:00.000Z',
    decidedAt: null,
    decidedBy: null,
    deciderId: null,
    preparedApplySummary: null,
    preparedNotifySummary: null,
    payload: {},
    ...over,
  };
}

const targets: SuggestionTarget[] = [
  { targetId: 'task_12', targetKey: 'ENG-12', targetLabel: 'Ship onboarding' },
  { targetId: 'task_99', targetKey: 'ENG-99', targetLabel: 'Docs pass' },
];

describe('SuggestionCard', () => {
  it('shows evidence fields and runs confirm with pending feedback', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    const onConfirm = vi.fn(() => gate);
    const view = render(SuggestionCard, {
      props: {
        suggestion: suggestion({
          preparedApplySummary: 'Link to ENG-12',
          preparedNotifySummary: 'Please review ENG-12',
        }),
        viewer: SUBJECT,
        onConfirm,
        onDismiss: vi.fn(),
      },
    });
    expect(view.getByText('Link blocker to ENG-12')).toBeTruthy();
    expect(view.getByText('Prepared change').parentElement?.textContent).toContain(
      'Link to ENG-12'
    );
    expect(view.getByText(/Simulated · no real authority/)).toBeTruthy();

    const button = view.getByRole('button', { name: 'Confirm' });
    await fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    resolve();
    await waitFor(() => expect(button.getAttribute('aria-busy')).not.toBe('true'));
  });

  it('shows Approve for act_with_approval when the viewer may approve', async () => {
    const onApprove = vi.fn(async () => undefined);
    const view = render(SuggestionCard, {
      props: {
        suggestion: suggestion({
          mode: 'act_with_approval',
          preparedApplySummary: 'Apply link',
        }),
        viewer: APPROVER,
        onApprove,
        onDismiss: vi.fn(),
      },
    });
    expect(view.queryByRole('button', { name: 'Confirm' })).toBeNull();
    await fireEvent.click(view.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledOnce());
  });

  it('hides Approve for a non-approver and keeps dismiss for the subject', () => {
    const view = render(SuggestionCard, {
      props: {
        suggestion: suggestion({ mode: 'act_with_approval' }),
        viewer: SUBJECT,
        onApprove: vi.fn(),
        onDismiss: vi.fn(),
      },
    });
    expect(view.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(view.getByText('Waiting for an approver.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('edits through an explicit onEdit callback with a chosen target', async () => {
    const onEdit = vi.fn(async () => undefined);
    const view = render(SuggestionCard, {
      props: {
        suggestion: suggestion(),
        viewer: SUBJECT,
        targets,
        onConfirm: vi.fn(),
        onDismiss: vi.fn(),
        onEdit,
      },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Edit' }));
    // The target is a Texuli select: open it and pick the option.
    const select = view.getByRole('combobox', { name: 'Link to target' });
    expect(select.id).toBe('suggestion-edit-approval_sug_resp_1');
    await fireEvent.click(select);
    await fireEvent.click(view.getByRole('option', { name: 'ENG-99 — Docs pass' }));
    await fireEvent.click(view.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'approval_sug_resp_1' }),
        expect.objectContaining({ targetId: 'task_99', targetKey: 'ENG-99' })
      )
    );
  });

  it('surfaces callback errors without clearing the card', async () => {
    const onDismiss = vi.fn(async () => {
      throw new Error('Only the subject may dismiss.');
    });
    const view = render(SuggestionCard, {
      props: {
        suggestion: suggestion(),
        viewer: SUBJECT,
        onConfirm: vi.fn(),
        onDismiss,
      },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(view.getByRole('alert').textContent).toMatch(/Only the subject/));
  });
});

describe('ChatApprovalCard', () => {
  it('runs approve and dismiss callbacks with pending state', async () => {
    const onApprove = vi.fn(async () => undefined);
    const onDismiss = vi.fn(async () => undefined);
    const view = render(ChatApprovalCard, {
      props: {
        suggestion: suggestion({ mode: 'act_with_approval', preparedApplySummary: 'Apply' }),
        viewer: APPROVER,
        onApprove,
        onDismiss,
      },
    });
    expect(view.getByText(/Simulated approval/)).toBeTruthy();
    await fireEvent.click(view.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledOnce());
    await fireEvent.click(view.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce());
  });
});

describe('AutonomyLevelPicker', () => {
  it('calls onChange with setLevel result and refuses capped external level 4 in UI', async () => {
    const onChange = vi.fn(async () => undefined);
    const view = render(AutonomyLevelPicker, {
      props: { config: DEFAULT_AUTONOMY, area: 'records', onChange },
    });
    const level4 = view.getByRole('radio', { name: 'Level 4: Act within limits' });
    await fireEvent.click(level4);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ levels: expect.objectContaining({ records: 4 }) }),
        4
      )
    );
    view.unmount();

    const external = render(AutonomyLevelPicker, {
      props: { config: DEFAULT_AUTONOMY, area: 'external', onChange: vi.fn() },
    });
    const capped = external.getByRole('radio', { name: 'Level 4: Act within limits' });
    expect((capped as HTMLInputElement).disabled).toBe(true);
  });
});

describe('AuditTrail', () => {
  it('lists newest first and shows empty state', () => {
    const empty = render(AuditTrail, { props: { entries: [] } });
    expect(empty.getByText('No audit entries yet')).toBeTruthy();
    empty.unmount();

    const entries: AuditEntry[] = [
      {
        id: 'a1',
        scopeId: 'org',
        at: '2026-03-15T10:00:00.000Z',
        actor: 'agent',
        actorId: null,
        action: 'suggested',
        suggestionId: 's1',
        detail: 'Suggested: link',
      },
      {
        id: 'a2',
        scopeId: 'org',
        at: '2026-03-15T11:00:00.000Z',
        actor: 'person',
        actorId: 'person_avery',
        action: 'confirmed',
        suggestionId: 's1',
        detail: 'Applied: link',
      },
    ];
    const view = render(AuditTrail, { props: { entries } });
    const cells = [...view.container.querySelectorAll('[data-py-audit-row]')].map((row) =>
      row.getAttribute('data-py-audit-row')
    );
    expect(cells[0]).toBe('a2');
    expect(view.getByText('Confirmed')).toBeTruthy();
    expect(view.getByText('Simulated agent')).toBeTruthy();
  });
});
