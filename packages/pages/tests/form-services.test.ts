// @vitest-environment node

import type { FormBlock } from '@protoyard/blocks';
import type { PrototypeRuntime } from '@protoyard/core';
import { describe, expect, it, vi } from 'vitest';
import { FORM_RESPONSES_TABLE, type FormResponse } from '../src/form-response.ts';
import { createFormServices } from '../src/form-services.ts';

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
      async transaction<T>(mode: 'r' | 'rw', _table: MemoryTable, callback: () => Promise<T>) {
        transactionModes.push(mode);
        return callback();
      },
    },
    session: {
      assert: vi.fn((capability: string) => {
        if (!grants.has(capability)) throw new Error(`Permission denied: ${capability}`);
      }),
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

  it('clears only the requested form and requires form:admin', async () => {
    const { services, transactionModes, environmentCalls } = harness();
    await services.submit('contact-form', { email: 'ada@example.com' });
    await services.submit('other-form', { message: 'Keep this row' });

    expect(await services.clear('contact-form')).toBe(1);
    expect(await services.list('contact-form')).toEqual([]);
    expect((await services.list('other-form'))[0]?.values).toEqual({ message: 'Keep this row' });
    expect(transactionModes).toEqual(['rw', 'rw', 'rw', 'r', 'r']);
    expect(environmentCalls).toEqual(['forms.submit', 'forms.submit', 'forms.clear']);
  });

  it.each([
    ['form:submit', 'form:read', 'form:admin'],
    ['form:read', 'form:submit', 'form:admin'],
    ['form:admin', 'form:submit', 'form:read'],
  ])('requires the matching capability %s', async (missing, ...granted) => {
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
  });

  it('rejects malformed rows already present in the response table', async () => {
    const { services, table } = harness();
    table.seed({ id: 'bad id', formId: 'contact-form', createdAt: 'not a date', values: {} });

    await expect(services.list('contact-form')).rejects.toMatchObject({
      issues: expect.any(Object),
    });
  });
});
