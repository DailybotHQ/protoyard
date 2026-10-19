import type { PrototypeRuntime } from '@protoyard/core';
import type { PrototypeDatabase } from '@protoyard/database';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { redactSecretFields } from '../src/snapshots.ts';
import { createTasksDefinition } from './fixtures/tasks-prototype.ts';

/**
 * Simulated auth keeps typed passwords as plain text in this browser
 * (`simulatedPassword`). An exported snapshot file leaves the browser, so
 * those values are blanked on export; local saved snapshots keep them.
 */

type Runtime = PrototypeRuntime<PrototypeDatabase>;
type Row = Record<string, unknown> & { id: string };
const harnesses: ReturnType<typeof createHarness>[] = [];
afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.closeAll();
});

const SECRET = 'typed simulated password';

async function bootWithPassword(): Promise<{ runtime: Runtime; taskId: string }> {
  const harness = createHarness<PrototypeDatabase>(createTasksDefinition());
  harnesses.push(harness);
  const runtime = (await harness.boot()) as Runtime;
  const task = (await runtime.db.rows<Row>('tasks').toCollection().first()) as Row;
  // Any table: the field name is what marks a typed secret.
  await runtime.db.rows<Row>('tasks').put({ ...task, simulatedPassword: SECRET });
  return { runtime, taskId: task.id };
}

function exportedRow(json: string, id: string): Row | undefined {
  const parsed = JSON.parse(json) as { tables: { name: string; rows: Row[] }[] };
  return parsed.tables.find((t) => t.name === 'tasks')?.rows.find((row) => row.id === id);
}

describe('snapshot export redacts simulated passwords', () => {
  it('blanks simulatedPassword in the exported JSON of the current world', async () => {
    const { runtime, taskId } = await bootWithPassword();
    const { json } = await runtime.snapshots.exportJson();
    expect(json).not.toContain(SECRET);
    const row = exportedRow(json, taskId);
    expect(row).toBeDefined();
    expect(row?.simulatedPassword).toBeNull();
    // The live record is untouched.
    expect((await runtime.db.rows<Row>('tasks').get(taskId))?.simulatedPassword).toBe(SECRET);
  });

  it('blanks it when exporting a saved snapshot, which keeps it locally', async () => {
    const { runtime, taskId } = await bootWithPassword();
    const saved = await runtime.snapshots.save({ name: 'With a password' });
    const { json } = await runtime.snapshots.exportJson(saved.id);
    expect(json).not.toContain(SECRET);
    expect(exportedRow(json, taskId)?.simulatedPassword).toBeNull();

    await runtime.db.rows<Row>('tasks').update(taskId, { simulatedPassword: 'changed' });
    await runtime.snapshots.restore(saved.id);
    expect((await runtime.db.rows<Row>('tasks').get(taskId))?.simulatedPassword).toBe(SECRET);
  });

  it('an exported file still imports, with the password left blank', async () => {
    const { runtime, taskId } = await bootWithPassword();
    const { json } = await runtime.snapshots.exportJson();
    await runtime.snapshots.importJson(json, { restore: true });
    const restored = await runtime.db.rows<Row>('tasks').get(taskId);
    expect(restored).toBeDefined();
    expect(restored?.simulatedPassword).toBeNull();
  });

  it('redactSecretFields copies rows, skipping null and absent values', () => {
    const rows = [
      { id: 'a', simulatedPassword: 'x' },
      { id: 'b', simulatedPassword: null },
      { id: 'c' },
    ];
    const input = [{ name: 'saas_accounts', rows }];
    const { tables, redacted } = redactSecretFields(input);
    expect(redacted).toBe(1);
    expect(tables[0]?.rows).toEqual([
      { id: 'a', simulatedPassword: null },
      { id: 'b', simulatedPassword: null },
      { id: 'c' },
    ]);
    expect(rows[0]?.simulatedPassword).toBe('x');
  });
});
