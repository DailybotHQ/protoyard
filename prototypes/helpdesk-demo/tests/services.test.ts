import { createFileServices } from '@protoyard/blueprint';
import { PermissionDeniedError, type Row } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import { blueprint } from '../src/generated/blueprint.ts';
import { createServices } from '../src/generated/services.ts';
import { definition } from '../src/prototype.ts';

describe('help desk services (real runtime)', () => {
  let harness = createHarness(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness(definition);
  });

  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition, harness);
  });

  it('moves a ticket on the board, records audit history, and keeps it after a reload', async () => {
    let runtime = await harness.boot('active');
    const services = createServices(runtime);
    const [first] = (await services.ticket!.list()).filter((t) => t.status === 'open');
    await services.ticket!.update(String(first!.id), { status: 'pending' });
    runtime = await harness.reload(runtime);
    const again = createServices(runtime);
    expect((await again.ticket!.get(String(first!.id)))?.status).toBe('pending');
    const audit = (await (runtime.db as { table(n: string): { toArray(): Promise<Row[]> } })
      .table('auditEntries')
      .toArray()) as Row[];
    expect(audit.some((a) => a.recordId === first!.id && a.action === 'update')).toBe(true);
  });

  it('keeps a viewer read-only in the service layer', async () => {
    const runtime = await harness.boot('viewer');
    const services = createServices(runtime);
    const [ticket] = await services.ticket!.list();
    await expect(
      services.ticket!.update(String(ticket!.id), { status: 'solved' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      services.reply!.create({ message: 'Hi there', ticketId: ticket!.id })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      createFileServices(runtime, blueprint).ticket!.upload({
        entity: 'ticket',
        recordId: ticket!.id,
        field: 'attachments',
        file: new File(['x'], 'a.txt', { type: 'text/plain' }),
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
