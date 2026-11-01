/**
 * Page/doc rendering security: no raw HTML injection, unsafe URL schemes
 * stripped, form values never assign prototype pollution keys, and pages-ui
 * source hygiene. AGENTS.md rule 7; docs/SECURITY.md page/doc row.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type FormBlock as FormBlockData } from '@protoyard/blocks';
import { definePrototypeFromPage } from '@protoyard/blueprint/kinds';
import { type PrototypeDefinition, type PrototypeRuntime, type WorldSeed } from '@protoyard/core';
import {
  createFormServices,
  type DocDocument,
  FORM_CAPABILITIES,
  type FormServices,
  PageDocumentSchema,
} from '@protoyard/pages';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import CtaBlock from '../../blocks-ui/src/structure/CtaBlock.svelte';
import MdRenderer from '../../blocks-ui/src/text/MdRenderer.svelte';
import DocEditor from '../src/doc/DocEditor.svelte';
import FormBlock from '../src/form/FormBlock.svelte';
import ResponsesPanel from '../src/form/ResponsesPanel.svelte';

afterEach(() => cleanup());

const PAGES_UI_SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');

const FORBIDDEN_SOURCE = [
  { id: 'html-directive', re: /\{@html\b/ },
  { id: 'eval', re: /\beval\s*\(/ },
  { id: 'new-function', re: /\bnew\s+Function\b|\bFunction\s*\(/ },
  { id: 'inner-html', re: /\.innerHTML\s*=/ },
  { id: 'outer-html', re: /\.outerHTML\s*=/ },
  { id: 'insert-adjacent-html', re: /\.insertAdjacentHTML\s*\(/ },
  { id: 'document-write', re: /\bdocument\.write(?:ln)?\s*\(/ },
];

function walkSourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      out.push(...walkSourceFiles(path));
      continue;
    }
    if (/\.(ts|svelte|js|css)$/.test(name)) out.push(path);
  }
  return out;
}

const HOSTILE_MARKDOWN = [
  'Hello <script>alert("xss")</script> world',
  '',
  '<img src=x onerror="alert(1)">',
  '',
  '[click](javascript:alert(1))',
  '',
  '[data](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '',
  '![bad](javascript:alert(1))',
  '',
  '![remote](https://evil.example/track.png)',
  '',
  '[ok](https://example.com/docs)',
  '',
  '![local](./assets/cover.webp)',
].join('\n');

function fakeServices(submit: FormServices['submit']): Pick<FormServices, 'submit'> {
  return { submit };
}

function fixtureForm(fields: FormBlockData['fields']): FormBlockData {
  return {
    type: 'form',
    id: 'sec-form',
    title: 'Contact',
    submitLabel: 'Send',
    successMessage: 'Thanks.',
    fields,
  };
}

describe('pages-ui source hygiene', () => {
  it('contains no raw HTML injection or eval patterns', () => {
    const files = walkSourceFiles(PAGES_UI_SRC);
    expect(files.length).toBeGreaterThan(5);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const rule of FORBIDDEN_SOURCE) {
        if (rule.re.test(text)) {
          hits.push(`${file.replace(PAGES_UI_SRC, 'src')}: ${rule.id}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('rich text rendering (MdRenderer used by page/doc text blocks)', () => {
  it('shows raw HTML as literal text and never injects script or handlers', () => {
    const view = render(MdRenderer, { props: { source: HOSTILE_MARKDOWN } });
    const root = view.container;

    expect(root.querySelector('script, iframe, object, embed')).toBeNull();
    for (const el of root.querySelectorAll('*')) {
      for (const attr of el.getAttributeNames()) {
        expect(attr.startsWith('on'), `${el.tagName}.${attr}`).toBe(false);
      }
    }

    // Hostile tags stay visible as text content.
    expect(root.textContent).toContain('<script>alert("xss")</script>');
    expect(root.textContent).toContain('<img src=x onerror="alert(1)">');

    const hrefs = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://example.com/docs']);
    expect(hrefs.every((h) => h && !/^javascript:/i.test(h) && !/^data:/i.test(h))).toBe(true);

    const srcs = [...root.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['./assets/cover.webp']);
    expect(srcs.every((s) => s && !/^javascript:/i.test(s) && !/^data:/i.test(s))).toBe(true);
  });
});

describe('structure blocks strip unsafe hrefs', () => {
  it('CtaBlock drops javascript: and data: actions', () => {
    const view = render(CtaBlock, {
      props: {
        block: {
          type: 'cta',
          title: 'Try it',
          actions: [
            { label: 'Bad js', href: 'javascript:alert(1)', variant: 'primary' },
            { label: 'Bad data', href: 'data:text/html,hi', variant: 'secondary' },
            { label: 'Docs', href: 'https://example.com/docs', variant: 'primary' },
            { label: 'Anchor', href: '#next', variant: 'link' },
          ],
        },
      },
    });
    // Unsafe schemes never become href attributes (external https is a button).
    const hrefs = [...view.container.querySelectorAll('[href]')].map((el) =>
      el.getAttribute('href')
    );
    expect(hrefs.every((h) => h && !/^(javascript|data|vbscript):/i.test(h))).toBe(true);
    expect(hrefs).toContain('#next');
    expect(view.queryByRole('button', { name: 'Bad js' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Bad data' })).toBeNull();
    expect(view.getByRole('button', { name: 'Docs' })).toBeTruthy();
    expect(view.getByRole('link', { name: 'Anchor' })).toBeTruthy();
  });
});

describe('FormBlock prototype pollution', () => {
  it('never assigns __proto__, constructor or prototype on submit values', async () => {
    const fields = [
      { name: 'fullName', label: 'Full name', type: 'text' as const, required: true },
      { name: '__proto__', label: 'Proto', type: 'text' as const },
      { name: 'constructor', label: 'Ctor', type: 'text' as const },
      { name: 'prototype', label: 'ProtoType', type: 'text' as const },
    ];
    const form = fixtureForm(fields as FormBlockData['fields']);
    const submit = vi.fn().mockResolvedValue({ id: 'response-1' });
    const view = render(FormBlock, {
      props: { form, services: fakeServices(submit) },
    });

    // Unsafe fields are not rendered as controls.
    expect(view.queryByLabelText('Proto')).toBeNull();
    expect(view.queryByLabelText('Ctor')).toBeNull();
    expect(view.queryByLabelText('ProtoType')).toBeNull();

    await fireEvent.input(view.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());

    const submitted = submit.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.hasOwn(submitted, '__proto__')).toBe(false);
    expect(Object.hasOwn(submitted, 'constructor')).toBe(false);
    expect(Object.hasOwn(submitted, 'prototype')).toBe(false);
    expect(Object.getPrototypeOf(submitted)).toBe(Object.prototype);
    expect(submitted.fullName).toBe('Ada Example');
  });

  it('ignores pollution keys injected through validation issue maps', async () => {
    const form = fixtureForm([
      { name: 'fullName', label: 'Full name', type: 'text', required: true },
    ]);
    const submit = vi.fn().mockRejectedValue({
      issues: {
        fullName: 'Too short',
        __proto__: 'pollute',
        constructor: 'pollute',
      },
    });
    const view = render(FormBlock, {
      props: { form, services: fakeServices(submit) },
    });
    await fireEvent.input(view.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(view.getByText('Too short')).toBeTruthy());
    // Error bag must not become a polluted object prototype.
    expect(Object.getPrototypeOf(Object.prototype)).toBe(null);
  });
});

// --- merged from form-block.test.ts ---

describe('form-block', () => {
  afterEach(cleanup);

  function fixtureForm(): FormBlockData {
    return {
      type: 'form',
      id: 'contact-form',
      title: 'Contact us',
      description: 'Tell us how to reach you.',
      fields: [
        { name: 'fullName', label: 'Full name', type: 'text', required: true },
        {
          name: 'topic',
          label: 'Topic',
          type: 'enum',
          required: false,
          options: [
            { value: 'question', label: 'Question' },
            { value: 'feedback', label: 'Feedback' },
          ],
        },
        { name: 'details', label: 'Details', type: 'longText', required: false },
        { name: 'updates', label: 'Send me updates', type: 'boolean', required: false },
      ],
      submitLabel: 'Send message',
      successMessage: 'Thanks. We received your message.',
    };
  }

  function fakeServices(submit = vi.fn().mockResolvedValue({ id: 'response-1' })) {
    return { submit };
  }

  describe('FormBlock', () => {
    it('submits valid values through the service and shows the success message', async () => {
      const submit = vi.fn().mockResolvedValue({ id: 'response-1' });
      const view = render(FormBlock, {
        props: { form: fixtureForm(), services: fakeServices(submit) },
      });

      await fireEvent.input(view.getByRole('textbox', { name: /^Full name/ }), {
        target: { value: 'Ada Example' },
      });
      await fireEvent.click(view.getByRole('button', { name: 'Send message' }));

      await waitFor(() =>
        expect(submit).toHaveBeenCalledWith('contact-form', {
          fullName: 'Ada Example',
          details: '',
          updates: false,
        })
      );
      expect(submit.mock.calls[0]?.[1]).not.toHaveProperty('topic');
      await waitFor(() =>
        expect(view.getByRole('status').textContent).toContain('Thanks. We received your message.')
      );
      expect(view.container.querySelector('.tx-forms__done')?.textContent).toBe(
        'Thanks. We received your message.'
      );
    });

    it('shows pending feedback while the service promise is unresolved', async () => {
      let finish = (): void => {};
      const submit = vi.fn(
        () =>
          new Promise<{ id: string }>((resolve) => (finish = () => resolve({ id: 'response-1' })))
      );
      const view = render(FormBlock, {
        props: { form: fixtureForm(), services: fakeServices(submit) },
      });
      await fireEvent.input(view.getByRole('textbox', { name: /^Full name/ }), {
        target: { value: 'Ada Example' },
      });
      const button = view.getByRole('button', { name: 'Send message' });
      await fireEvent.click(button);

      await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
      expect(button.hasAttribute('disabled')).toBe(true);
      finish();
      await waitFor(() => expect(view.getByRole('status').textContent).toContain('Thanks.'));
    });
  });
});

// --- merged from responses-panel.test.ts ---

describe('responses-panel', () => {
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
  });
});

// --- merged from doc-editor.test.ts ---

describe('doc-editor', () => {
  afterEach(cleanup);

  const doc: DocDocument = {
    id: 'editor-doc',
    title: 'Editor doc',
    blocks: [
      { type: 'heading', id: 'title', level: 1, text: 'Editor doc' },
      { type: 'text', id: 'intro', markdown: 'Body text.' },
      {
        type: 'table',
        id: 'numbers',
        caption: 'Numbers by region',
        columns: [{ label: 'Region' }],
        rows: [['North']],
      },
      { type: 'text', id: 'outro', markdown: 'Closing text.' },
    ],
  };

  describe('DocEditor (real @texuli/pages editor)', () => {
    it('applies a reorder from the op log back to the doc body', async () => {
      const onApply = vi.fn();
      const view = render(DocEditor, { props: { doc, onApply, onCancel: vi.fn() } });
      const handles = await waitFor(() => {
        const found = view.container.querySelectorAll<HTMLElement>(
          '[data-py-doc-editor] [aria-roledescription], [data-py-doc-editor] .tx-pages-handle'
        );
        expect(found.length).toBeGreaterThan(2);
        return found;
      });
      // Alt+ArrowDown moves the focused block one row down (the editor's keyboard reorder).
      const outroIndex = 3;
      const handle = handles[outroIndex - 2] as HTMLElement;
      handle.focus();
      await fireEvent.keyDown(handle, { key: 'ArrowDown', altKey: true });
      await waitFor(() =>
        expect(
          (view.getByRole('button', { name: 'Apply changes' }) as HTMLButtonElement).disabled
        ).toBe(false)
      );
      await fireEvent.click(view.getByRole('button', { name: 'Apply changes' }));
      expect(onApply).toHaveBeenCalledTimes(1);
      const [next, notes] = onApply.mock.calls[0] as [DocDocument, unknown[]];
      expect(notes).toEqual([]);
      expect(next.blocks.map((block) => block.id)).not.toEqual(doc.blocks.map((block) => block.id));
      expect(new Set(next.blocks.map((block) => block.id))).toEqual(
        new Set(doc.blocks.map((block) => block.id))
      );
    });

    it('names a refused save and stays open', async () => {
      const onApply = vi.fn().mockRejectedValue(
        Object.assign(new Error('Validation failed'), {
          issues: { document: 'These edits belong to another doc.' },
        })
      );
      const view = render(DocEditor, { props: { doc, onApply, onCancel: vi.fn() } });
      const handles = await waitFor(() => {
        const found = view.container.querySelectorAll<HTMLElement>(
          '[data-py-doc-editor] [aria-roledescription], [data-py-doc-editor] .tx-pages-handle'
        );
        expect(found.length).toBeGreaterThan(2);
        return found;
      });
      const handle = handles[1] as HTMLElement;
      handle.focus();
      await fireEvent.keyDown(handle, { key: 'ArrowDown', altKey: true });
      await waitFor(() =>
        expect(
          (view.getByRole('button', { name: 'Apply changes' }) as HTMLButtonElement).disabled
        ).toBe(false)
      );
      await fireEvent.click(view.getByRole('button', { name: 'Apply changes' }));
      expect(await view.findByText('These edits belong to another doc.')).toBeTruthy();
      expect(view.container.querySelector('[data-py-doc-editor]')).toBeTruthy();
    });
  });
});
