// @vitest-environment node

import { type FormBlock } from '@protoyard/blocks';
import { type PrototypeRuntime } from '@protoyard/core';
import { describe, expect, it, vi } from 'vitest';
import { createDocEditServices, DOC_EDITS_TABLE } from '../src/doc-edits.ts';
import { FORM_RESPONSES_TABLE, type FormResponse } from '../src/form-response.ts';
import { createFormServices } from '../src/form-services.ts';
import { type DocDocument } from '../src/schema.ts';

class MemoryTable {
  private rows = new Map<string, unknown>();

  async add(row: FormResponse): Promise<string> {
    if (this.rows.has(row.id)) throw new Error(`Duplicate row id: ${row.id}`);
    this.rows.set(row.id, structuredClone(row));
    return row.id;
  }

  async toArray(): Promise<unknown[]> {
    return [...this.rows.values()].map((row) => structuredClone(row));
  }

  where(index: string) {
    if (index !== 'formId') throw new Error(`Unsupported index: ${index}`);
    return {
      equals: (formId: string) => ({
        toArray: async () =>
          (await this.toArray()).filter((row) => (row as FormResponse).formId === formId),
        delete: async () => {
          const matches = [...this.rows.entries()].filter(
            ([, row]) => (row as FormResponse).formId === formId
          );
          for (const [id] of matches) this.rows.delete(id);
          return matches.length;
        },
      }),
    };
  }

  seed(row: unknown): void {
    this.rows.set((row as FormResponse).id, structuredClone(row));
  }
}

const form = {
  type: 'form',
  id: 'contact-form',
  fields: [
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'note', label: '=Note', type: 'longText', maxLength: 1_000 },
    { name: 'score', label: 'Score', type: 'number', max: 10 },
    {
      name: 'topics',
      label: 'Topics',
      type: 'tags',
      maxTags: 4,
    },
  ],
  submitLabel: 'Send',
  successMessage: 'Thanks for your feedback.',
} satisfies FormBlock;

const otherForm = {
  type: 'form',
  id: 'other-form',
  fields: [{ name: 'message', label: 'Message', type: 'text' }],
  submitLabel: 'Send',
  successMessage: 'Received.',
} satisfies FormBlock;

function harness(granted: readonly string[] = ['form:submit', 'form:read', 'form:admin']) {
  const table = new MemoryTable();
  const transactionModes: string[] = [];
  const environmentCalls: string[] = [];
  const grants = new Set(granted);
  const runtime = {
    db: {
      table(name: string) {
        if (name !== FORM_RESPONSES_TABLE) throw new Error(`Unknown table: ${name}`);
        return table;
      },
      async transaction<T>(mode: 'r' | 'rw', _tables: unknown, callback: () => Promise<T>) {
        transactionModes.push(mode);
        return callback();
      },
    },
    session: {
      assert: vi.fn((capability: string) => {
        if (!grants.has(capability)) throw new Error(`Permission denied: ${capability}`);
      }),
      principal: vi.fn(() => ({ persona: { id: 'audience' } })),
    },
    environment: {
      run: vi.fn(async <T>(operation: string, callback: () => T | Promise<T>) => {
        environmentCalls.push(operation);
        return callback();
      }),
    },
    clock: { now: () => new Date('2030-01-02T03:04:05.000Z') },
  } as unknown as PrototypeRuntime;
  return {
    table,
    transactionModes,
    environmentCalls,
    runtime,
    services: createFormServices(runtime, [form, otherForm]),
  };
}

describe('createFormServices', () => {
  it('validates and persists a row, then lists it through the form index', async () => {
    const { services, transactionModes, environmentCalls } = harness();
    const saved = await services.submit('contact-form', {
      email: '  ada@example.com  ',
      note: '  Hello  ',
      score: 8,
      topics: ['research'],
    });

    expect(saved).toMatchObject({
      formId: 'contact-form',
      createdAt: '2030-01-02T03:04:05.000Z',
      values: { email: 'ada@example.com', note: 'Hello', score: 8, topics: ['research'] },
    });
    expect(saved.id).toMatch(/^response-u[a-z0-9]{12}$/);
    expect(await services.list('contact-form')).toEqual([saved]);
    expect(transactionModes).toEqual(['rw', 'r']);
    expect(environmentCalls).toEqual(['forms.submit']);
  });

  it('rejects invalid values and unknown forms before environment or database writes', async () => {
    const { services, transactionModes, environmentCalls } = harness();

    await expect(services.submit('contact-form', { email: 'not-an-email' })).rejects.toMatchObject({
      issues: expect.objectContaining({ email: expect.any(String) }),
    });
    await expect(
      services.submit('contact-form', { email: 'ada@example.com', unknownField: 'no' })
    ).rejects.toMatchObject({
      issues: expect.objectContaining({ form: expect.stringContaining('Unrecognized key') }),
    });
    await expect(services.submit('missing-form', {})).rejects.toMatchObject({
      issues: { formId: expect.any(String) },
    });
    expect(transactionModes).toEqual([]);
    expect(environmentCalls).toEqual([]);
  });

  it('exports labeled columns with formula-like headers and text guarded', async () => {
    const { services } = harness();
    await services.submit('contact-form', {
      email: 'ada@example.com',
      note: '=HYPERLINK("https://example.com","open")',
      score: -5,
      topics: ['one', 'two'],
    });

    const csv = await services.exportCsv('contact-form');
    expect(csv).toContain("Submitted at,Email,'=Note,Score,Topics\r\n");
    expect(csv).toContain(`'=HYPERLINK(""https://example.com"",""open"")`);
    expect(csv).toContain(',-5,"[""one"",""two""]"');
  });

  it('requires the matching capability for every service', async () => {
    for (const [missing, ...granted] of [
      ['form:submit', 'form:read', 'form:admin'],
      ['form:read', 'form:submit', 'form:admin'],
      ['form:admin', 'form:submit', 'form:read'],
    ]) {
      const { services, runtime, transactionModes, environmentCalls } = harness(granted);
      const operation =
        missing === 'form:submit'
          ? services.submit('contact-form', { email: 'ada@example.com' })
          : missing === 'form:read'
            ? services.list('contact-form')
            : services.clear('contact-form');

      await expect(operation).rejects.toThrow(`Permission denied: ${missing}`);
      if (missing === 'form:read') {
        await expect(services.exportCsv('contact-form')).rejects.toThrow(
          `Permission denied: ${missing}`
        );
      }
      expect(runtime.session.assert).toHaveBeenCalledWith(missing);
      expect(transactionModes).toEqual([]);
      expect(environmentCalls).toEqual([]);
    }
  });

  it('rejects malformed rows already present in the response table', async () => {
    const { services, table } = harness();
    table.seed({ id: 'bad id', formId: 'contact-form', createdAt: 'not a date', values: {} });

    await expect(services.list('contact-form')).rejects.toMatchObject({
      issues: expect.any(Object),
    });
  });
});

// --- merged from doc-edits.test.ts ---

describe('doc-edits', () => {
  const doc: DocDocument = {
    id: 'field-report',
    title: 'Field report',
    blocks: [
      { type: 'heading', id: 'title', level: 1, text: 'Field report' },
      { type: 'text', id: 'intro', markdown: 'Original body.' },
    ],
  };

  const edited = (markdown: string): DocDocument => ({
    ...doc,
    blocks: [doc.blocks[0]!, { type: 'text', id: 'intro', markdown }],
  });

  function harness(granted: readonly string[] = ['blocks:interact']) {
    const rows = new Map<string, unknown>();
    const transactionModes: string[] = [];
    const environmentCalls: string[] = [];
    const grants = new Set(granted);
    const runtime = {
      manifest: { storage: { namespace: 'bp-world-one' } },
      db: {
        table(name: string) {
          if (name !== DOC_EDITS_TABLE) throw new Error(`Unknown table: ${name}`);
          return {
            get: async (key: string) => structuredClone(rows.get(key)),
            put: async (row: { key: string }) => {
              rows.set(row.key, structuredClone(row));
            },
            delete: async (key: string) => {
              rows.delete(key);
            },
          };
        },
        async transaction<T>(mode: 'r' | 'rw', _tables: unknown, callback: () => Promise<T>) {
          transactionModes.push(mode);
          return callback();
        },
      },
      session: {
        assert: vi.fn((capability: string) => {
          if (!grants.has(capability)) throw new Error(`Permission denied: ${capability}`);
        }),
        principal: vi.fn(() => ({ persona: { id: 'presenter' } })),
      },
      environment: {
        run: vi.fn(async <T>(operation: string, callback: () => T | Promise<T>) => {
          environmentCalls.push(operation);
          return callback();
        }),
      },
      clock: { now: () => new Date('2030-01-02T03:04:05.000Z') },
    } as unknown as PrototypeRuntime;
    return {
      rows,
      runtime,
      transactionModes,
      environmentCalls,
      services: createDocEditServices(runtime),
    };
  }

  describe('createDocEditServices', () => {
    it('refuses a viewer, another doc and an invalid body before any write', async () => {
      const viewer = harness([]);
      await expect(viewer.services.save(doc, edited('No.'))).rejects.toThrow(/Permission denied/);
      await expect(viewer.services.reset(doc)).rejects.toThrow(/Permission denied/);

      const { services, rows, environmentCalls } = harness();
      await expect(services.save(doc, { ...edited('x'), id: 'other-doc' })).rejects.toMatchObject({
        issues: { document: 'These edits belong to another doc.' },
      });
      await expect(services.save(doc, { ...doc, blocks: [] })).rejects.toMatchObject({
        issues: { document: expect.any(String) },
      });
      await expect(
        services.save(doc, { ...doc, blocks: [{ type: 'script', code: 'alert(1)' }] })
      ).rejects.toMatchObject({ issues: { document: expect.any(String) } });
      await expect(services.save(doc, null)).rejects.toMatchObject({
        issues: { document: expect.any(String) },
      });
      expect(rows.size).toBe(0);
      expect(environmentCalls).toEqual([]);
    });

    it('re-validates a stored row as untrusted and never returns a tampered one', async () => {
      const { services, rows } = harness();
      await services.save(doc, edited('Saved body.'));
      const key = 'bp-world-one::field-report';
      const good = rows.get(key) as Record<string, unknown>;

      rows.set(key, { ...good, blocks: [{ type: 'html', html: '<img src=x onerror=alert(1)>' }] });
      expect(await services.load(doc)).toMatchObject({ status: 'invalid' });

      rows.set(key, { ...good, extra: 'field' });
      expect(await services.load(doc)).toMatchObject({ status: 'invalid' });

      rows.set(key, { ...good, docId: 'someone-else' });
      expect(await services.load(doc)).toMatchObject({ status: 'invalid' });

      rows.set(key, { ...good, blocks: Array.from({ length: 5_000 }, () => good.blocks) });
      expect(await services.load(doc)).toMatchObject({ status: 'invalid' });
    });

    it('resets through the environment and says whether there was anything to clear', async () => {
      const { services, environmentCalls } = harness();
      expect(await services.reset(doc)).toBe(false);
      await services.save(doc, edited('Saved body.'));
      expect(await services.reset(doc)).toBe(true);
      expect(await services.load(doc)).toEqual({ status: 'none' });
      expect(environmentCalls).toEqual(['docs.resetEdits', 'docs.saveEdits', 'docs.resetEdits']);
    });
  });
});
