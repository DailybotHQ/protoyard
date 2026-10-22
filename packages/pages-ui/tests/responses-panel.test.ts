import type { FormBlock as FormBlockData } from '@protoyard/blocks';
import type { PrototypeDefinition, PrototypeRuntime, WorldSeed } from '@protoyard/core';
import {
  createFormServices,
  definePrototypeFromPage,
  FORM_CAPABILITIES,
  type FormServices,
  PageDocumentSchema,
} from '@protoyard/pages';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import ResponsesPanel from '../src/form/ResponsesPanel.svelte';

const FORM: FormBlockData = {
  type: 'form',
  id: 'beta-signup',
  title: 'Join the beta',
  fields: [
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'seats', label: 'Seats', type: 'number' },
    { name: 'topics', label: 'Topics', type: 'tags' },
    { name: 'updates', label: 'Send updates', type: 'boolean' },
  ],
  submitLabel: 'Request access',
  successMessage: 'Thanks. This is a simulated form.',
};

const PAGE = PageDocumentSchema.parse({
  id: 'beta',
  title: 'Beta',
  sections: [{ id: 'signup', blocks: [FORM] }],
});

const JOINED = '2026-01-01T00:00:00.000Z';

/** The page runtime plus personas whose simulated roles carry the form capabilities. */
function definition(): PrototypeDefinition {
  const base = definePrototypeFromPage(PAGE, { namespace: 'responses-panel-test' });
  const world = (): WorldSeed => ({
    organizations: [
      {
        id: 'org-example',
        name: 'Example Org',
        createdAt: JOINED,
      } as WorldSeed['organizations'][number],
    ],
    personas: [
      { id: 'admin', name: 'Ada Admin', joinedAt: JOINED },
      { id: 'reader', name: 'Rui Reader', joinedAt: JOINED },
      { id: 'visitor', name: 'Vi Visitor', joinedAt: JOINED },
    ] as WorldSeed['personas'],
    memberships: [
      {
        id: 'm-admin',
        personaId: 'admin',
        organizationId: 'org-example',
        role: 'admin',
        joinedAt: JOINED,
      },
      {
        id: 'm-reader',
        personaId: 'reader',
        organizationId: 'org-example',
        role: 'reader',
        joinedAt: JOINED,
      },
      {
        id: 'm-visitor',
        personaId: 'visitor',
        organizationId: 'org-example',
        role: 'visitor',
        joinedAt: JOINED,
      },
    ] as WorldSeed['memberships'],
    tables: {},
  });
  return {
    ...base,
    policy: {
      roles: {
        admin: [FORM_CAPABILITIES.submit, FORM_CAPABILITIES.read, FORM_CAPABILITIES.admin],
        reader: [FORM_CAPABILITIES.submit, FORM_CAPABILITIES.read],
        visitor: [FORM_CAPABILITIES.submit],
      },
    },
    generate: world,
    generateWorld: async () => world(),
  };
}

let harness = createHarness(definition());
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness(definition());
});

async function boot(persona = 'admin') {
  const runtime: PrototypeRuntime = await harness.boot();
  await runtime.session.switchActor(persona);
  const services = createFormServices(runtime, [FORM]);
  return { runtime, services };
}

function panel(
  runtime: PrototypeRuntime,
  services: FormServices,
  extra: Record<string, unknown> = {}
) {
  return render(ResponsesPanel, {
    props: {
      form: FORM,
      services,
      can: (capability: string) => runtime.session.can(capability),
      ...extra,
    },
  });
}

describe('ResponsesPanel with the real form services', () => {
  it('lists two submissions live, exports them as a CSV blob, and clears them after confirmation', async () => {
    const { runtime, services } = await boot('admin');
    const save = vi.fn();
    const view = panel(runtime, services, { save });

    expect(await view.findByText(/No responses yet/)).toBeTruthy();

    await services.submit(FORM.id, {
      email: 'ada@example.com',
      seats: 3,
      topics: ['decks'],
      updates: true,
    });
    await services.submit(FORM.id, { email: 'rui@example.com', updates: false });

    await waitFor(() =>
      expect(view.container.querySelectorAll('[data-py-response-row]')).toHaveLength(2)
    );
    const table = view.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
    ).toEqual(['Submitted', 'Email', 'Seats', 'Topics', 'Send updates']);
    expect(within(table).getByText('ada@example.com')).toBeTruthy();
    expect(within(table).getByText('Yes')).toBeTruthy();
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
    expect(view.getByText('2 responses')).toBeTruthy();

    await fireEvent.click(view.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const [blob, filename] = save.mock.calls[0] as [Blob, string];
    expect(filename).toBe('beta-signup-responses.csv');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/csv;charset=utf-8');
    const csv = await blob.text();
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Submitted at,Email,Seats,Topics,Send updates');
    expect(lines).toHaveLength(3);
    // Both rows share the simulated clock's time, so their order follows response ids.
    expect(
      lines.slice(1).some((line) => line.endsWith(',ada@example.com,3,"[""decks""]",true'))
    ).toBe(true);
    expect(lines.slice(1).some((line) => line.endsWith(',rui@example.com,,,false'))).toBe(true);
    expect(view.getByText('Exported 2 responses to beta-signup-responses.csv.')).toBeTruthy();

    await fireEvent.click(view.getByRole('button', { name: 'Clear…' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/all 2 responses/)).toBeTruthy();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Clear responses' }));

    expect(await view.findByText(/No responses yet/)).toBeTruthy();
    expect(view.getByText('Cleared 2 responses.')).toBeTruthy();
    expect(await services.list(FORM.id)).toEqual([]);
  });

  it('updates when a submission arrives from elsewhere on the page', async () => {
    const { runtime, services } = await boot('admin');
    const view = panel(runtime, services);
    await view.findByText(/No responses yet/);
    await services.submit(FORM.id, { email: 'late@example.com' });
    expect(await view.findByText('late@example.com')).toBeTruthy();
    expect(view.getByText('1 response')).toBeTruthy();
  });

  it('cancelling the confirmation keeps every response', async () => {
    const { runtime, services } = await boot('admin');
    await services.submit(FORM.id, { email: 'keep@example.com' });
    const view = panel(runtime, services);
    await view.findByText('keep@example.com');
    await fireEvent.click(view.getByRole('button', { name: 'Clear…' }));
    const dialog = await screen.findByRole('alertdialog');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await services.list(FORM.id)).toHaveLength(1);
    expect(view.getByText('keep@example.com')).toBeTruthy();
  });

  it('a reader sees the list and can export, but has no clear action', async () => {
    const { runtime, services } = await boot('reader');
    await services.submit(FORM.id, { email: 'reader@example.com' });
    const view = panel(runtime, services, { save: vi.fn() });
    await view.findByText('reader@example.com');
    expect(view.getByRole('button', { name: 'Download CSV' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Clear…' })).toBeNull();
    expect(view.getByText('Only a simulated form admin can clear responses.')).toBeTruthy();
  });

  it('a visitor without form:read sees a note and no data', async () => {
    const { runtime, services } = await boot('visitor');
    await services.submit(FORM.id, { email: 'visitor@example.com' });
    const view = panel(runtime, services);
    expect(view.getByRole('note').textContent).toMatch(/cannot read responses/);
    expect(view.queryByRole('table')).toBeNull();
    expect(view.queryByRole('button')).toBeNull();
    await expect(services.list(FORM.id)).rejects.toThrow();
  });
});

describe('ResponsesPanel states', () => {
  const fake = (over: Partial<Pick<FormServices, 'list' | 'exportCsv' | 'clear'>> = {}) => ({
    list: vi.fn(async () => []),
    exportCsv: vi.fn(async () => 'Submitted at\r\n'),
    clear: vi.fn(async () => 0),
    ...over,
  });

  it('shows a loading state, then the error a failing list reports', async () => {
    // liveQuery runs the querier more than once (a tracking probe, then the subscription).
    const services = fake({
      list: vi.fn(
        () =>
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Storage is unavailable in this browser.')), 20)
          )
      ),
    });
    const view = render(ResponsesPanel, { props: { form: FORM, services } });
    expect(view.getByText('Loading responses…')).toBeTruthy();
    expect((await view.findByRole('alert')).textContent).toContain(
      'Storage is unavailable in this browser.'
    );
  });

  it('shows the export error and keeps the list', async () => {
    const row = {
      id: 'response-1',
      formId: FORM.id,
      createdAt: '2026-01-02T03:04:05.000Z',
      values: { email: 'a@example.com' },
    };
    const services = fake({
      list: vi.fn(async () => [row]),
      exportCsv: vi.fn(async () => {
        throw new Error('Export is disabled in this scenario.');
      }),
    });
    const save = vi.fn();
    const view = render(ResponsesPanel, { props: { form: FORM, services, save } });
    await view.findByText('a@example.com');
    expect(view.getByText('Jan 2, 2026, 3:04 AM UTC')).toBeTruthy();
    await fireEvent.click(view.getByRole('button', { name: 'Download CSV' }));
    expect((await view.findByRole('alert')).textContent).toBe(
      'Export is disabled in this scenario.'
    );
    expect(save).not.toHaveBeenCalled();
    expect(view.getByText('a@example.com')).toBeTruthy();
  });

  it('keeps the dialog open with the error when clearing fails', async () => {
    const row = {
      id: 'response-1',
      formId: FORM.id,
      createdAt: JOINED,
      values: { email: 'b@example.com' },
    };
    const services = fake({
      list: vi.fn(async () => [row]),
      clear: vi.fn(async () => {
        throw new Error('Clearing is blocked by the active scenario.');
      }),
    });
    const view = render(ResponsesPanel, { props: { form: FORM, services } });
    await view.findByText('b@example.com');
    await fireEvent.click(view.getByRole('button', { name: 'Clear…' }));
    const dialog = await screen.findByRole('alertdialog');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Clear responses' }));
    expect(
      await within(dialog).findByText('Clearing is blocked by the active scenario.')
    ).toBeTruthy();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('downloads through an object URL by default', async () => {
    const row = {
      id: 'response-1',
      formId: FORM.id,
      createdAt: JOINED,
      values: { email: 'c@example.com' },
    };
    const services = fake({ list: vi.fn(async () => [row]), exportCsv: vi.fn(async () => 'csv') });
    const create = vi.fn(() => 'blob:responses');
    const revoke = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    try {
      const view = render(ResponsesPanel, { props: { form: FORM, services } });
      await view.findByText('c@example.com');
      await fireEvent.click(view.getByRole('button', { name: 'Download CSV' }));
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
      expect(create).toHaveBeenCalledWith(expect.any(Blob));
      const anchor = click.mock.contexts[0] as HTMLAnchorElement;
      expect(anchor.download).toBe('beta-signup-responses.csv');
      await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:responses'));
    } finally {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
      click.mockRestore();
    }
  });
});
