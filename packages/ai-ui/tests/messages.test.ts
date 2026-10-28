import { MESSAGE_FORMAT } from '@protoyard/ai/messages';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBytes, formatCell, hostOf } from '../src/messages/format.ts';
import { ChatMessageBlocks, type MessageActionEvent } from '../src/messages/index.ts';

afterEach(cleanup);

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const msg = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({
  format: MESSAGE_FORMAT,
  id: 'msg-1',
  blocks,
  ...extra,
});

/** A promise the test settles by hand, to observe pending states. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function view(message: unknown, props: Record<string, unknown> = {}) {
  return render(ChatMessageBlocks, { message, ...props });
}

/** Picks an option from a Texuli select (its trigger is a combobox button). */
async function choose(trigger: HTMLElement, option: string) {
  await fireEvent.click(trigger);
  await fireEvent.click(await screen.findByRole('option', { name: option }));
}

describe('chat message blocks: rendering', () => {
  it('renders plain text as text and markdown through the safe renderer', () => {
    const { container } = view(
      msg([
        { type: 'text', text: 'Hello there, plain\nsecond line' },
        {
          type: 'text',
          format: 'markdown',
          text: 'A **bold** move and a [link](https://example.com).',
        },
      ])
    );
    const plain = container.querySelector('p[data-py-message-block="text"]');
    expect(plain?.textContent).toBe('Hello there, plain\nsecond line');
    expect(plain?.className).toContain('whitespace-pre-wrap');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    const link = screen.getByRole('link', { name: 'link' });
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('renders a table with caption, headers, alignment and formatted cells', () => {
    view(
      msg([
        {
          type: 'table',
          title: 'Open tickets',
          columns: [
            { key: 'name', header: 'Name' },
            { key: 'count', header: 'Count', align: 'end' },
            { key: 'urgent', header: 'Urgent' },
          ],
          rows: [
            { name: 'Billing', count: 1234.5, urgent: true },
            { name: 'Login', urgent: false },
          ],
        },
      ])
    );
    const table = screen.getByRole('table');
    expect(within(table).getByText('Open tickets').tagName).toBe('CAPTION');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
    ).toEqual(['Name', 'Count', 'Urgent']);
    expect(within(table).getByText('1,234.5').className).toContain('tx-table__cell--end');
    expect(within(table).getByText('Yes')).toBeTruthy();
    expect(within(table).getByText('—')).toBeTruthy();
    // Texuli's table owns the scroll area: it turns into a focusable region named by the title when it overflows.
    expect(
      table.closest('[data-tx-table-wrap]')?.closest('[data-py-message-block="table"]')
    ).not.toBeNull();
  });

  it('renders a link preview that never loads remote media and opens safely', () => {
    const { container } = view(
      msg([
        {
          type: 'link_preview',
          url: 'https://www.example.com/post',
          title: 'Release notes',
          description: 'What changed this week.',
          image: PNG,
        },
        { type: 'link_preview', url: 'https://example.com/plain', image: 'attachment:thumb-1' },
      ])
    );
    const card = screen.getByRole('link', { name: /Release notes/ });
    expect(card.getAttribute('href')).toBe('https://www.example.com/post');
    expect(card.getAttribute('target')).toBe('_blank');
    expect(card.getAttribute('rel')).toBe('noopener noreferrer');
    expect(within(card).getByText('example.com')).toBeTruthy();
    const images = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(images).toEqual([PNG]);
  });

  it('renders attachments: inline images, named files, and host-opened files', async () => {
    const onOpenAttachment = vi.fn(() => Promise.resolve());
    view(
      msg([{ type: 'text', text: 'Files' }], {
        attachments: [
          { id: 'a1', name: 'chart.png', mime: 'image/png', size: 80, url: PNG },
          {
            id: 'a2',
            name: 'brief.pdf',
            mime: 'application/pdf',
            size: 1536,
            url: 'files/brief.pdf',
          },
          { id: 'a3', name: 'photo.png', mime: 'image/png', size: 10, url: 'attachment:photo-1' },
        ],
      }),
      { onOpenAttachment }
    );
    expect(screen.getByRole('img', { name: 'chart.png' })).toBeTruthy();
    expect(screen.getByText('1.5 KB')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'brief.pdf' }));
    expect(onOpenAttachment).toHaveBeenCalledWith(expect.objectContaining({ id: 'a2' }));
    expect(screen.getByRole('button', { name: 'photo.png' })).toBeTruthy();
  });
});

describe('chat message blocks: safe fallback', () => {
  it('shows an unknown block as the plain notice the parser put in its place', () => {
    const { container } = view(
      msg([{ type: 'carousel', fallback: 'A carousel of three products.' }])
    );
    const note = container.querySelector('[data-py-message-block="unknown"]');
    expect(note?.textContent).toBe('A carousel of three products.');
    expect(note?.getAttribute('role')).toBe('note');
  });

  it('shows a short note, never the content, for an invalid message', () => {
    const { container } = view(
      msg([{ type: 'buttons', buttons: [{ label: 'Pay', url: 'javascript:alert(1)' }] }])
    );
    expect(container.querySelector('[data-py-message-invalid]')?.textContent).toMatch(
      /could not be shown \(1 problem\)/
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Pay')).toBeNull();
  });

  it.each([
    ['markup in text', msg([{ type: 'text', text: '<img src=x onerror=alert(1)>' }])],
    ['a newer format', { format: 'protoyard.message@2', blocks: [{ type: 'text', text: 'hi' }] }],
    ['not JSON', '{"format":'],
    [
      'a remote preview image',
      msg([
        { type: 'link_preview', url: 'https://example.com', image: 'https://evil.example/x.png' },
      ]),
    ],
  ])('refuses %s', (_name, input) => {
    const { container } = view(input);
    expect(container.querySelector('[data-py-message-invalid]')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('accepts the message as JSON text too', () => {
    view(JSON.stringify(msg([{ type: 'text', text: 'From JSON' }])));
    expect(screen.getByText('From JSON')).toBeTruthy();
  });
});

describe('chat message blocks: actions', () => {
  it('reports a typed button event and stays busy until the host settles', async () => {
    const gate = deferred();
    const events: MessageActionEvent[] = [];
    view(
      msg([
        {
          type: 'buttons',
          buttons: [
            { label: 'Approve', action: 'approve', value: 'req-7', style: 'primary' },
            { label: 'Docs', url: 'https://example.com/docs' },
          ],
        },
      ]),
      {
        onAction: (event: MessageActionEvent) => {
          events.push(event);
          return gate.promise;
        },
      }
    );
    const approve = screen.getByRole('button', { name: 'Approve' });
    await fireEvent.click(approve);
    expect(events).toEqual([
      { kind: 'button', messageId: 'msg-1', blockIndex: 0, action: 'approve', value: 'req-7' },
    ]);
    expect(approve.getAttribute('aria-busy')).toBe('true');
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    gate.resolve();
    await waitFor(() => expect(approve.getAttribute('aria-busy')).toBeNull());
    expect((approve as HTMLButtonElement).disabled).toBe(false);
    const docs = screen.getByRole('link', { name: /Docs/ });
    expect(docs.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows the host error and re-enables the button when the action fails', async () => {
    view(msg([{ type: 'buttons', buttons: [{ label: 'Retry', action: 'retry' }] }]), {
      onAction: () => Promise.reject(new Error('The queue is offline.')),
    });
    const retry = screen.getByRole('button', { name: 'Retry' });
    await fireEvent.click(retry);
    expect((await screen.findByRole('alert')).textContent).toBe('The queue is offline.');
    expect((retry as HTMLButtonElement).disabled).toBe(false);
  });

  it('asks for confirmation inline before a confirmed action, and cancels with Escape', async () => {
    const onAction = vi.fn(() => Promise.resolve());
    view(
      msg([
        {
          type: 'buttons',
          buttons: [
            {
              label: 'Delete draft',
              action: 'delete',
              style: 'danger',
              confirm: {
                title: 'Delete the draft?',
                body: 'This cannot be undone.',
                confirmLabel: 'Delete',
                cancelLabel: 'Keep it',
              },
            },
          ],
        },
      ]),
      { onAction }
    );
    const trigger = screen.getByRole('button', { name: 'Delete draft' });
    await fireEvent.click(trigger);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete the draft?' });
    expect(onAction).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent?.trim()).toBe('Keep it');
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    await tick();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await fireEvent.click(trigger);
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'button', action: 'delete', value: null })
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('disables actions with a note when no handler is given', () => {
    view(msg([{ type: 'buttons', buttons: [{ label: 'Approve', action: 'approve' }] }]));
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByText('Actions are not available in this view.')).toBeTruthy();
  });

  it('reports a single select on change and restores the choice on failure', async () => {
    const onAction = vi
      .fn<(event: MessageActionEvent) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Could not save.'));
    view(
      msg([
        {
          type: 'select',
          action: 'pick-team',
          label: 'Team',
          placeholder: 'Choose a team',
          options: [
            { value: 'design', label: 'Design' },
            { value: 'eng', label: 'Engineering' },
          ],
        },
      ]),
      { onAction }
    );
    const select = screen.getByRole('combobox', { name: 'Team' });
    await choose(select, 'Engineering');
    expect(onAction).toHaveBeenLastCalledWith({
      kind: 'select',
      messageId: 'msg-1',
      blockIndex: 0,
      action: 'pick-team',
      values: ['eng'],
    });
    await screen.findByText('Sent.');
    await choose(select, 'Design');
    expect((await screen.findByRole('alert')).textContent).toBe('Could not save.');
    await waitFor(() => expect(select.textContent?.trim()).toBe('Engineering'));
  });

  it('sends a multiple select as a checkbox group', async () => {
    const onAction = vi.fn(() => Promise.resolve());
    view(
      msg([
        {
          type: 'select',
          action: 'tags',
          placeholder: 'Pick tags',
          multiple: true,
          initial: ['bug'],
          options: [
            { value: 'bug', label: 'Bug' },
            { value: 'ux', label: 'UX', description: 'Usability issues' },
          ],
        },
      ]),
      { onAction }
    );
    const group = screen.getByRole('group', { name: 'Pick tags' });
    expect(within(group).getByRole('checkbox', { name: /Bug/ }).getAttribute('aria-checked')).toBe(
      'true'
    );
    await fireEvent.click(within(group).getByRole('checkbox', { name: /UX/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'select', values: ['bug', 'ux'] })
    );
  });
});

describe('chat message blocks: forms', () => {
  const FORM = msg([
    {
      type: 'form',
      action: 'file-bug',
      title: 'Report a bug',
      submitLabel: 'File it',
      fields: [
        { key: 'title', label: 'Title', kind: 'text', required: true },
        { key: 'details', label: 'Details', kind: 'textarea' },
        {
          key: 'severity',
          label: 'Severity',
          kind: 'select',
          required: true,
          options: [
            { value: 'low', label: 'Low' },
            { value: 'high', label: 'High' },
          ],
        },
        { key: 'count', label: 'Affected users', kind: 'number' },
        { key: 'due', label: 'Due', kind: 'date', initial: '2026-11-02' },
        {
          key: 'areas',
          label: 'Areas',
          kind: 'multiselect',
          options: [
            { value: 'web', label: 'Web' },
            { value: 'mobile', label: 'Mobile' },
          ],
        },
        { key: 'agree', label: 'I checked the docs', kind: 'checkbox', required: true },
      ],
    },
  ]);

  it('checks required fields before sending and points to the first problem', async () => {
    const onAction = vi.fn();
    view(FORM, { onAction });
    await fireEvent.click(screen.getByRole('button', { name: 'File it' }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText('Title is required.')).toBeTruthy();
    expect(screen.getByText('Severity is required.')).toBeTruthy();
    expect(screen.getByText('I checked the docs must be checked.')).toBeTruthy();
    expect(screen.getByLabelText(/Title/).getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText(/Title/));
  });

  it('submits typed values, shows pending, then locks as submitted', async () => {
    const gate = deferred();
    const events: MessageActionEvent[] = [];
    view(FORM, {
      onAction: (event: MessageActionEvent) => {
        events.push(event);
        return gate.promise;
      },
    });
    await fireEvent.input(screen.getByLabelText(/Title/), { target: { value: 'Login loops' } });
    await choose(screen.getByLabelText(/Severity/), 'High');
    await fireEvent.input(screen.getByLabelText(/Affected users/), { target: { value: '42' } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Mobile' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: /I checked the docs/ }));
    const submit = screen.getByRole('button', { name: 'File it' });
    await fireEvent.click(submit);
    expect(events).toEqual([
      {
        kind: 'form',
        messageId: 'msg-1',
        blockIndex: 0,
        action: 'file-bug',
        values: {
          title: 'Login loops',
          details: '',
          severity: 'high',
          count: 42,
          due: '2026-11-02',
          areas: ['mobile'],
          agree: true,
        },
      },
    ]);
    expect(submit.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Sending…')).toBeTruthy();
    gate.resolve();
    await screen.findByText('Submitted.');
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the input and shows the host error when the submission fails', async () => {
    view(FORM, {
      onAction: () => Promise.reject(new Error('Tracker is read-only in this scenario.')),
    });
    await fireEvent.input(screen.getByLabelText(/Title/), { target: { value: 'Crash' } });
    await choose(screen.getByLabelText(/Severity/), 'Low');
    await fireEvent.click(screen.getByRole('checkbox', { name: /I checked the docs/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'File it' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Tracker is read-only in this scenario.'
    );
    expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe('Crash');
    expect((screen.getByRole('button', { name: 'File it' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('cannot be sent without a handler', () => {
    view(FORM);
    expect((screen.getByRole('button', { name: 'File it' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByText('This form cannot be sent from this view.')).toBeTruthy();
  });
});

describe('chat message helpers', () => {
  it('formats cells, sizes and hosts as text', () => {
    expect(formatCell(null)).toBe('—');
    expect(formatCell('')).toBe('—');
    expect(formatCell(false)).toBe('No');
    expect(formatCell(1_234_567.891)).toBe('1,234,567.891');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
    expect(hostOf('https://www.example.com/a')).toBe('example.com');
    expect(hostOf('not a url')).toBe('not a url');
  });
});
