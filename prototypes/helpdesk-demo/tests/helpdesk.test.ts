import { createFileServices, createNotificationService } from '@protoyard/blueprint';
import { PermissionDeniedError, type Row } from '@protoyard/core';
import {
  createGenerateContextAsync,
  PRESETS,
  resolveScenarios,
  validateWorld,
} from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { blueprint } from '../src/generated/blueprint.ts';
import { createServices } from '../src/generated/services.ts';
import {
  byUrgency,
  helpdeskMetrics,
  neighborStatus,
  slaLabel,
  slaState,
} from '../src/lib/metrics.ts';
import { definition } from '../src/prototype.ts';
import { generate } from '../src/scenarios/generators.ts';
import { SLA_HOURS } from '../src/scenarios/helpdesk.ts';

const scenarios = resolveScenarios(definition.scenarios, PRESETS);
const scenario = (id: string) => scenarios.find((s) => s.id === id) ?? (null as never);
const world = async (id: string) => generate(await createGenerateContextAsync(scenario(id)));
const HOUR = 3_600_000;

describe('help desk metrics', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');
  const ticket = (over: Partial<Row>): Row => ({
    id: 't',
    subject: 'Subject',
    status: 'open',
    priority: 'normal',
    slaDueAt: '2026-06-01T15:00:00.000Z',
    assigneeId: 'user_0002',
    ...over,
  });

  it('computes SLA state and labels from the simulated clock', () => {
    expect(slaState(ticket({ slaDueAt: '2026-06-01T09:00:00.000Z' }), now)).toEqual({
      kind: 'breached',
      hours: 3,
    });
    expect(slaState(ticket({}), now)).toEqual({ kind: 'due', hours: 3 });
    expect(slaState(ticket({ status: 'solved' }), now)).toEqual({ kind: 'met' });
    expect(slaState(ticket({ slaDueAt: null }), now)).toEqual({ kind: 'none' });
    expect(slaLabel({ kind: 'breached', hours: 50 })).toBe('Breached 2 d ago');
    expect(slaLabel({ kind: 'due', hours: 0 })).toBe('Due within the hour');
    expect(slaLabel({ kind: 'due', hours: 5 })).toBe('Due in 5 h');
  });

  it('builds the board, SLA counters and agent load', () => {
    const tickets = [
      ticket({ id: 'a', status: 'open', priority: 'low' }),
      ticket({ id: 'b', status: 'open', priority: 'urgent', slaDueAt: '2026-06-01T10:00:00.000Z' }),
      ticket({ id: 'c', status: 'solved', slaDueAt: '2026-05-01T00:00:00.000Z' }),
      ticket({
        id: 'd',
        status: 'pending',
        assigneeId: null,
        slaDueAt: '2026-06-03T00:00:00.000Z',
      }),
    ];
    const m = helpdeskMetrics(tickets, now);
    expect(m).toMatchObject({ total: 4, unsolved: 3, breached: 1, dueSoon: 1, urgent: 1 });
    expect(m.board.open.map((t) => t.id)).toEqual(['b', 'a']);
    expect(m.board.solved.map((t) => t.id)).toEqual(['c']);
    expect(m.agentLoad).toEqual([
      { personaId: 'user_0002', open: 2, breached: 1 },
      { personaId: null, open: 1, breached: 0 },
    ]);
    expect([...tickets].sort(byUrgency)[0]?.id).toBe('b');
    expect(neighborStatus('open', -1)).toBeNull();
    expect(neighborStatus('open', 1)).toBe('pending');
    expect(neighborStatus('solved', 1)).toBeNull();
  });
});

describe('help desk world', () => {
  it('is deterministic and passes the derived integrity rules', async () => {
    for (const s of scenarios) {
      const a = await generate(await createGenerateContextAsync(s));
      const b = await generate(await createGenerateContextAsync(s));
      expect(a, s.id).toEqual(b);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: s.referenceTime }),
        s.id
      ).toEqual([]);
    }
  });

  it('looks like a real desk: mixed statuses, SLA from priority, fictional copy', async () => {
    const active = await world('active');
    const tickets = active.tables.tickets as Row[];
    expect(tickets.length).toBeGreaterThanOrEqual(24);
    expect(new Set(tickets.map((t) => t.status)).size).toBe(4);
    expect(new Set(tickets.map((t) => t.priority)).size).toBeGreaterThanOrEqual(3);
    for (const t of tickets) {
      const created = Date.parse(String(t.createdAt));
      expect(Date.parse(String(t.slaDueAt)) - created).toBe(
        (SLA_HOURS[String(t.priority)] ?? 0) * HOUR
      );
      expect(created).toBeLessThanOrEqual(Date.parse(scenario('active').referenceTime));
    }
    const m = helpdeskMetrics(tickets, new Date(scenario('active').referenceTime));
    expect(m.breached).toBeGreaterThan(0);
    expect(m.unsolved).toBeGreaterThan(m.breached);
    for (const c of active.tables.customers as Row[]) {
      expect(String(c.email)).toMatch(/@example\.(com|org)$/);
    }
    const replies = active.tables.replies as Row[];
    expect(replies.some((r) => r.internal === true)).toBe(true);
    expect((await world('empty')).tables.tickets).toEqual([]);
    expect(((await world('massive')).tables.tickets as Row[]).length).toBeGreaterThanOrEqual(200);
  });
});

describe('help desk services (real runtime)', () => {
  let harness = createHarness(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness(definition);
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

  it('attaches a file through the file service, persisted with the ticket', async () => {
    let runtime = await harness.boot('active');
    const [ticket] = await createServices(runtime).ticket!.list();
    const files = createFileServices(runtime, blueprint);
    const file = new File(['printer error log'], 'error.txt', { type: 'text/plain' });
    const meta = await files.ticket!.upload({
      entity: 'ticket',
      recordId: ticket!.id,
      field: 'attachments',
      file,
    });
    expect(meta).toMatchObject({ name: 'error.txt', size: 17, type: 'text/plain' });
    runtime = await harness.reload(runtime);
    const reloaded = createFileServices(runtime, blueprint);
    expect((await reloaded.ticket!.list('ticket', String(ticket!.id))).map((f) => f.name)).toEqual([
      'error.txt',
    ]);
    await expect(
      reloaded.ticket!.upload({
        entity: 'ticket',
        recordId: ticket!.id,
        field: 'attachments',
        file: new File(['x'], 'tool.exe', { type: 'application/x-msdownload' }),
      })
    ).rejects.toMatchObject({ code: 'type-not-allowed' });
  });

  it('lets an agent reply and notifies a newly assigned agent', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const [ticket] = await services.ticket!.list();
    const reply = await services.reply!.create({
      message: 'Looking into it now.',
      ticketId: ticket!.id,
    });
    expect(reply.authorId).toBe(runtime.session.principal()?.persona.id);
    const agent = runtime.session.personas().find((p) => p.id !== reply.authorId);
    await services.ticket!.update(String(ticket!.id), { assigneeId: agent!.id });
    await runtime.session.switchActor(agent!.id);
    const inbox = await createNotificationService(runtime).list();
    expect(inbox.some((n) => String(n.title).includes(String(ticket!.subject)))).toBe(true);
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
