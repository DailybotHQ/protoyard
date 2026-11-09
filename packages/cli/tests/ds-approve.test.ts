// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APPROVAL_NOTE,
  designSystemContentHash,
  libraryEntryContentHash,
} from '@texuli/spec/design-system';
import { afterEach, describe, expect, it } from 'vitest';
import { contentHash, sha256File } from '../src/lib/design-systems.ts';
import { MCP_TOOLS } from '../src/mcp/tools.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * PLAN_013 T-tx015: the approval lives in the document (Texuli spec 0.13.0).
 * `ds approve` stamps it with Texuli's `approveDesignSystem`; `ds migrate`
 * folds a legacy approval.json into the document; `ds component approve`
 * approves a library entry. No MCP tool approves.
 */

type Envelope<T> = { ok: boolean; data: T; error?: { code: string; message: string } };

describe('ds approve, ds migrate and ds component approve', { timeout: 60_000 }, () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });
  const run = (...args: string[]) =>
    cli(['--root', (ws as TempWorkspace).root, '--json', 'ds', ...args]);
  const read = (path: string) =>
    JSON.parse(readFileSync(join((ws as TempWorkspace).root, path), 'utf8')) as Record<
      string,
      unknown
    >;

  it('writes the approval into the document with the content hash and prints the note', async () => {
    ws = createWorkspace();
    expect((await run('new', 'harbor', '--brand', '#0f766e', '--allow', 'minimal')).code).toBe(0);
    const before = read('design-systems/harbor/document.json');
    const approved = await run('approve', 'harbor', '--by', 'Ada Example');
    expect(approved.code, approved.stdout).toBe(0);
    const data =
      approved.json<
        Envelope<{ contentHash: string; note: string; guidance: string[]; version: string }>
      >().data;
    const document = read('design-systems/harbor/document.json');
    expect(document.approval).toMatchObject({
      status: 'approved',
      version: before.version,
      approvedBy: 'Ada Example',
      contentHash: designSystemContentHash(before),
    });
    expect(data.contentHash).toBe(contentHash(document));
    expect(data.note).toBe(APPROVAL_NOTE);
    expect(data.guidance.join(' ')).toContain('CODEOWNERS');
    expect(existsSync(join(ws.root, 'design-systems/harbor/approval.json'))).toBe(false);

    // The human-readable output carries the note and the commit guidance.
    const text = await cli(['--root', ws.root, 'ds', 'approve', 'harbor', '--by', 'Ada Example']);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain(APPROVAL_NOTE);
    expect(text.stdout).toContain('CODEOWNERS');

    // --release approves a new version and moves the document's version.
    const bumped = await run('approve', 'harbor', '--by', 'Ada Example', '--release', '2.0.0');
    expect(bumped.code, bumped.stdout).toBe(0);
    expect(read('design-systems/harbor/document.json')).toMatchObject({
      version: '2.0.0',
      approval: { status: 'approved', version: '2.0.0' },
    });
    const validated = await run('validate', 'harbor');
    expect(validated.json<Envelope<{ lockable: boolean; status: string }>>().data).toMatchObject({
      status: 'approved',
      lockable: true,
    });
  });

  it('refuses flat documents, unknown ids, a missing --by and a bad version', async () => {
    ws = createWorkspace();
    expect(
      (await run('new', 'flat-ds', '--brand', '#334155', '--out', 'design-systems/flat-ds.json'))
        .code
    ).toBe(0);
    const flat = await run('approve', 'flat-ds', '--by', 'Ada Example');
    expect(flat.code).not.toBe(0);
    expect(flat.stdout).toContain('flat document');
    expect(flat.stdout).toContain('ds migrate flat-ds');

    const unknown = await run('approve', 'nowhere', '--by', 'Ada Example');
    expect(unknown.code).not.toBe(0);
    expect(unknown.json<Envelope<unknown>>().error?.code).toBe('not_found');

    expect((await run('new', 'harbor', '--brand', '#0f766e')).code).toBe(0);
    expect((await run('approve', 'harbor')).code).not.toBe(0);
    expect((await run('approve', 'harbor', '--by', 'Ada\nExample')).code).not.toBe(0);
    expect((await run('approve', 'harbor', '--by', 'Ada', '--release', 'one')).code).not.toBe(0);
    expect((await run('approve', '../harbor', '--by', 'Ada')).code).not.toBe(0);
    expect(read('design-systems/harbor/document.json').approval).toMatchObject({
      status: 'draft',
    });
  });

  it('migrate folds a legacy approval.json into the document and adds library entries', async () => {
    ws = createWorkspace();
    expect((await run('new', 'harbor', '--brand', '#0f766e', '--allow', 'minimal')).code).toBe(0);
    const { approval: _draft, ...document } = read('design-systems/harbor/document.json');
    ws.write('design-systems/harbor/document.json', document);
    const sidecar = {
      status: 'approved',
      version: document.version,
      approvedBy: 'Ada Example',
      approvedAt: '2026-11-09T12:00:00.000Z',
      contentHash: contentHash(document),
    };
    ws.write('design-systems/harbor/approval.json', sidecar);
    const before = await run('validate', 'harbor');
    expect(
      before.json<Envelope<{ approvalSource: string; lockable: boolean }>>().data
    ).toMatchObject({ approvalSource: 'sidecar', lockable: true });

    const dry = await run('migrate', 'harbor', '--dry-run');
    expect(dry.code, dry.stdout).toBe(0);
    expect(existsSync(join(ws.root, 'design-systems/harbor/approval.json'))).toBe(true);
    const migrated = await run('migrate', 'harbor');
    expect(migrated.code, migrated.stdout).toBe(0);
    expect(migrated.json<Envelope<{ changes: string[] }>>().data.changes).toEqual([
      'moved approval.json into the document',
    ]);
    expect(existsSync(join(ws.root, 'design-systems/harbor/approval.json'))).toBe(false);
    expect(read('design-systems/harbor/document.json').approval).toEqual(sidecar);
    const after = await run('validate', 'harbor');
    expect(
      after.json<Envelope<{ approvalSource: string; lockable: boolean }>>().data
    ).toMatchObject({
      approvalSource: 'document',
      lockable: true,
    });

    // A component listed only in components.json joins the library (the hash moves).
    ws.write(
      'design-systems/harbor/components/StatusPill.svelte',
      '<script lang="ts">\n  import { Badge } from \'texuli/badge\';\n</script>\n<Badge label="x" />\n'
    );
    const pill = sha256File(join(ws.root, 'design-systems/harbor/components/StatusPill.svelte'));
    ws.write('design-systems/harbor/components.json', {
      format: 'protoyard/ds-components',
      version: 1,
      components: [
        {
          name: 'StatusPill',
          purpose: 'Shows a status.',
          version: '0.1.0',
          status: 'draft',
          file: 'components/StatusPill.svelte',
          sha256: pill,
        },
      ],
    });
    const synced = await run('migrate', 'harbor');
    expect(synced.code, synced.stdout).toBe(0);
    expect(synced.json<Envelope<{ changes: string[]; lockable: boolean }>>().data).toMatchObject({
      changes: ['added StatusPill to the library'],
      lockable: false,
    });
    expect(read('design-systems/harbor/document.json').library).toEqual([
      {
        id: 'status-pill',
        name: 'StatusPill',
        purpose: 'Shows a status.',
        version: '0.1.0',
        status: 'draft',
        composes: ['badge'],
      },
    ]);
  });

  it('ds component approve approves the components.json and library entries', async () => {
    ws = createWorkspace();
    expect((await run('new', 'harbor', '--brand', '#0f766e')).code).toBe(0);
    const component = (...args: string[]) => run('component', ...args);
    expect(
      (
        await component(
          'request',
          'harbor',
          'StatusPill',
          '--purpose',
          'Shows a status.',
          '--why',
          'Badges alone do not carry the label.'
        )
      ).code
    ).toBe(0);
    expect((await component('approve-request', 'harbor', 'StatusPill', '--by', 'Bo')).code).toBe(0);
    expect((await component('new', 'harbor', 'StatusPill')).code).toBe(0);
    expect((await component('approve', 'harbor', 'Missing', '--by', 'Bo')).code).not.toBe(0);
    expect((await component('approve', 'harbor', 'StatusPill')).code).not.toBe(0);

    const approved = await component('approve', 'harbor', 'StatusPill', '--by', 'Bo');
    expect(approved.code, approved.stdout).toBe(0);
    expect(read('design-systems/harbor/components.json').components).toEqual([
      expect.objectContaining({ name: 'StatusPill', status: 'approved', approvedBy: 'Bo' }),
    ]);
    const [entry] = read('design-systems/harbor/document.json').library as Record<
      string,
      unknown
    >[];
    const { approval, ...rest } = entry as { approval: Record<string, unknown> };
    expect(rest).toMatchObject({ id: 'status-pill', status: 'approved' });
    expect(approval).toMatchObject({
      status: 'approved',
      version: '0.1.0',
      approvedBy: 'Bo',
      contentHash: libraryEntryContentHash(rest),
    });
    // The design system itself approves next, over the library it now has.
    expect((await run('approve', 'harbor', '--by', 'Ada Example')).code).toBe(0);
    expect((await run('validate', 'harbor')).code).toBe(0);
  });

  it('no MCP tool approves a design system or a component', () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(names.filter((name) => /approve/.test(name))).toEqual([]);
  });
});
