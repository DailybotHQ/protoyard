// @vitest-environment node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { designSystemContentHash } from '@texuli/spec/design-system';
import { checkDesignSystemFull } from '@texuli/tools/ds-check';
import { afterEach, describe, expect, it } from 'vitest';
import { dsCheckInputs } from '../src/lib/ds-catalog.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * PLAN_013 T-bundle: `ds export <id> --bundle` packs a design-system folder
 * into one portable JSON file (Texuli's bundle inside), `ds import <file>`
 * checks it as untrusted input before it writes anything, and `ds validate`
 * runs Texuli's full validator over the catalog with Protoyard's extensions.
 */

type Envelope<T> = { ok: boolean; data: T; error?: { code: string; message: string } };
type Bundle = {
  format: string;
  version: number;
  designSystem: string;
  release: string;
  contentHash: string;
  texuli: {
    document: Record<string, unknown>;
    librarySources: { id: string; source: string; contentHash: string }[];
    history: { version: string; contentHash: string }[];
  };
  files: { path: string; sha256: string; bytes: number; text?: string; from?: string }[];
};
type Errors = { errors: { code: string; path: string }[] };

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Every file under `dir`, relative, sorted, with its bytes as text. */
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (at: string) => {
    for (const name of readdirSync(at, { withFileTypes: true })) {
      const absolute = join(at, name.name);
      if (name.isDirectory()) walk(absolute);
      else out[relative(dir, absolute)] = readFileSync(absolute, 'utf8');
    }
  };
  walk(dir);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

describe('design-system bundles (ds export --bundle, ds import)', { timeout: 120_000 }, () => {
  const spaces: TempWorkspace[] = [];
  afterEach(() => {
    for (const ws of spaces.splice(0)) ws.cleanup();
  });
  const workspace = () => {
    const ws = createWorkspace();
    spaces.push(ws);
    return ws;
  };
  const ds = (ws: TempWorkspace, ...args: string[]) =>
    cli(['--root', ws.root, '--json', 'ds', ...args]);

  /** An approved folder with a component, its request and story, a release record and a stray file. */
  async function source(): Promise<TempWorkspace> {
    const ws = workspace();
    const steps: string[][] = [
      ['new', 'harbor', '--brand', '#0f766e', '--allow', 'minimal'],
      [
        'component',
        'request',
        'harbor',
        'StatusPill',
        '--purpose',
        'Shows a ticket status with its label',
        '--why',
        'Badge has no label layout',
        '--by',
        'Ada Example',
      ],
      ['component', 'approve-request', 'harbor', 'StatusPill', '--by', 'Bo Example'],
      ['component', 'new', 'harbor', 'StatusPill'],
      ['approve', 'harbor', '--by', 'Ada Example'],
    ];
    for (const step of steps) {
      const run = await ds(ws, ...step);
      expect(run.code, `${step.join(' ')}: ${run.stdout}`).toBe(0);
    }
    const document = JSON.parse(
      readFileSync(join(ws.root, 'design-systems/harbor/document.json'), 'utf8')
    ) as Record<string, unknown>;
    const component = JSON.parse(
      readFileSync(join(ws.root, 'design-systems/harbor/components.json'), 'utf8')
    ) as { components: { name: string; version: string; sha256: string }[] };
    ws.write('design-systems/harbor/releases/1.0.0.json', {
      format: 'protoyard/ds-release',
      version: 1,
      designSystem: 'harbor',
      release: '1.0.0',
      contentHash: designSystemContentHash(document),
      approvedBy: 'Ada Example',
      approvedAt: '2026-11-09T12:00:00.000Z',
      components: component.components.map(({ name, version, sha256 }) => ({
        name,
        version,
        sha256,
      })),
      notes: 'First release.',
    });
    ws.write('design-systems/harbor/NOTES.md', '# Not part of a bundle\n');
    return ws;
  }

  async function exported(ws: TempWorkspace): Promise<{ file: string; bundle: Bundle }> {
    const run = await ds(ws, 'export', 'harbor', '--bundle', '--out', 'harbor.ds-bundle.json');
    expect(run.code, run.stdout).toBe(0);
    const file = join(ws.root, 'harbor.ds-bundle.json');
    return { file, bundle: JSON.parse(readFileSync(file, 'utf8')) as Bundle };
  }

  /** Writes a tampered copy of a bundle and imports it into a fresh workspace. */
  async function importTampered(bundle: unknown, ...flags: string[]) {
    const target = workspace();
    const file = join(target.root, 'tampered.json');
    writeFileSync(file, JSON.stringify(bundle));
    const run = await ds(target, 'import', file, ...flags);
    return { run, target };
  }

  it('round-trips a folder byte for byte through a fresh workspace', async () => {
    const ws = await source();
    const { file, bundle } = await exported(ws);
    const before = tree(join(ws.root, 'design-systems/harbor'));

    expect(bundle).toMatchObject({
      format: 'protoyard/ds-bundle',
      version: 1,
      designSystem: 'harbor',
      release: '1.0.0',
    });
    expect(bundle.files.map((f) => f.path)).toEqual([
      'components.json',
      'components/StatusPill.svelte',
      'document.json',
      'releases/1.0.0.json',
      'requests/StatusPill.json',
      'stories/StatusPill.json',
    ]);
    // The component source and the document ride in Texuli's part, once.
    expect(bundle.files.find((f) => f.path === 'document.json')?.from).toBe('document');
    expect(bundle.files.find((f) => f.path === 'components/StatusPill.svelte')?.from).toBe(
      'library:status-pill'
    );
    expect(bundle.texuli.librarySources.map((s) => s.id)).toEqual(['status-pill']);
    expect(bundle.texuli.history.map((h) => h.version)).toEqual(['1.0.0']);

    const again = await ds(ws, 'export', 'harbor', '--bundle');
    expect(again.code).toBe(0);
    const data = again.json<Envelope<{ skipped: string[]; bundle: Bundle }>>().data;
    expect(data.skipped).toEqual(['NOTES.md']);
    // Deterministic: the same folder packs to the same bundle.
    expect(`${JSON.stringify(data.bundle, null, 2)}\n`).toBe(readFileSync(file, 'utf8'));

    const target = workspace();
    const imported = await ds(target, 'import', file);
    expect(imported.code, imported.stdout).toBe(0);
    const result =
      imported.json<
        Envelope<{
          status: string;
          approvalReset: boolean;
          full: { ok: boolean };
          note: string;
          importedFrom: { sha256: string };
        }>
      >().data;
    expect(result).toMatchObject({ status: 'approved', approvalReset: false, full: { ok: true } });
    expect(result.importedFrom.sha256).toBe(sha(readFileSync(file, 'utf8')));
    expect(result.note).toContain('not a proof');

    const { 'NOTES.md': _skipped, ...expected } = before;
    expect(tree(join(target.root, 'design-systems/harbor'))).toEqual(expected);
    expect(readdirSync(join(target.root, 'design-systems'))).toEqual(['harbor']);

    const validated = await ds(target, 'validate', 'harbor');
    expect(validated.code, validated.stdout).toBe(0);
    expect(validated.json<Envelope<{ lockable: boolean }>>().data.lockable).toBe(true);
  });

  it('--dry-run checks everything and writes nothing', async () => {
    const { file } = await exported(await source());
    const target = workspace();
    const run = await ds(target, 'import', file, '--dry-run');
    expect(run.code, run.stdout).toBe(0);
    expect(run.json<Envelope<{ written: boolean; dryRun: boolean }>>().data).toMatchObject({
      written: false,
      dryRun: true,
    });
    expect(existsSync(join(target.root, 'design-systems'))).toBe(false);
  });

  it('never replaces an existing design system without --force, and stages a replacement', async () => {
    const ws = await source();
    const { file } = await exported(ws);
    const refused = await ds(ws, 'import', file);
    expect(refused.code).not.toBe(0);
    expect(refused.json<Envelope<unknown>>().error?.code).toBe('conflict');

    // A changed folder is replaced whole with --force; no staging folder is left.
    ws.write('design-systems/harbor/stories/Extra.json', { stray: true });
    const forced = await ds(ws, 'import', file, '--force');
    expect(forced.code, forced.stdout).toBe(0);
    expect(forced.json<Envelope<{ replaced: boolean }>>().data.replaced).toBe(true);
    expect(existsSync(join(ws.root, 'design-systems/harbor/stories/Extra.json'))).toBe(false);
    expect(existsSync(join(ws.root, 'design-systems/harbor/NOTES.md'))).toBe(false);
    expect(readdirSync(join(ws.root, 'design-systems')).filter((n) => n.startsWith('.'))).toEqual(
      []
    );

    // A flat document of the same id is never shadowed.
    const flat = workspace();
    flat.write('design-systems/harbor.json', { format: 'texuli/design-system' });
    const shadow = await ds(flat, 'import', file, '--force');
    expect(shadow.json<Envelope<unknown>>().error?.code).toBe('conflict');
  });

  it('refuses traversal, absolute paths, unknown files and duplicate names', async () => {
    const { bundle } = await exported(await source());
    const withFile = (extra: Record<string, unknown>) => ({
      ...bundle,
      files: [...bundle.files, extra],
    });
    const text = 'x';
    const entry = (path: string) => ({ path, sha256: sha(text), bytes: 1, text });

    for (const path of ['../escape.json', '/etc/passwd', 'components/../../x.svelte']) {
      const { run, target } = await importTampered(withFile(entry(path)));
      expect(run.code, path).toBe(4);
      expect(existsSync(join(target.root, 'design-systems')), path).toBe(false);
    }
    for (const [path, code] of [
      ['NOTES.md', 'unknown-file'],
      ['components/evil.js', 'unknown-file'],
      ['requests/StatusPill.json', 'duplicate-file'],
      ['Document.json', 'unknown-file'],
      ['stories/statuspill.json', 'unknown-file'],
    ] as const) {
      const { run } = await importTampered(withFile(entry(path)));
      expect(run.code, path).toBe(4);
      const errors = run.json<Envelope<Errors>>().data.errors.map((e) => e.code);
      expect(errors, path).toContain(code);
    }
    // Case-insensitive duplicates collide on macOS and Windows.
    const dup = bundle.files.find((f) => f.path === 'requests/StatusPill.json');
    const folded = await importTampered(withFile({ ...dup, path: 'requests/STATUSPILL.json' }));
    expect(folded.run.json<Envelope<Errors>>().data.errors.map((e) => e.code)).toContain(
      'duplicate-file'
    );
  });

  it('refuses a file whose hash, size or library source does not match', async () => {
    const { bundle } = await exported(await source());
    const tampered = structuredClone(bundle);
    const request = tampered.files.find((f) => f.path === 'requests/StatusPill.json');
    if (!request?.text) throw new Error('fixture');
    request.text = request.text.replace('Ada Example', 'Mallory Example');
    const first = await importTampered(tampered);
    expect(first.run.code).toBe(4);
    expect(first.run.json<Envelope<Errors>>().data.errors.map((e) => e.code)).toContain(
      'hash-mismatch'
    );

    // A source changed with its file hashes updated: Texuli's own hash refuses it.
    const swapped = structuredClone(bundle);
    const lib = swapped.texuli.librarySources[0];
    if (!lib) throw new Error('fixture');
    lib.source = `${lib.source}<script>alert(1)</script>\n`;
    const second = await importTampered(swapped);
    expect(second.run.code).toBe(4);
    expect(second.run.json<Envelope<Errors>>().data.errors.map((e) => e.code)).toContain(
      'library-hash-mismatch'
    );

    // ... and when the attacker fixes every hash, components.json still disagrees.
    const rehashed = structuredClone(swapped);
    const fixed = rehashed.texuli.librarySources[0];
    if (!fixed) throw new Error('fixture');
    fixed.contentHash = sha(fixed.source);
    const file = rehashed.files.find((f) => f.path === 'components/StatusPill.svelte');
    if (!file) throw new Error('fixture');
    file.sha256 = sha(fixed.source);
    file.bytes = Buffer.byteLength(fixed.source);
    const third = await importTampered(rehashed);
    expect(third.run.code).toBe(4);
    expect(third.run.json<Envelope<Errors>>().data.errors.map((e) => e.code)).toContain(
      'hash-mismatch'
    );

    // A document changed after export no longer matches the recorded content hash.
    const doc = structuredClone(bundle);
    doc.texuli.document.name = 'Changed';
    const fourth = await importTampered(doc);
    expect(fourth.run.code).toBe(4);
  });

  it('refuses an invalid schema, an oversized file and a too-deep bundle', async () => {
    const { bundle } = await exported(await source());
    for (const bad of [
      { ...bundle, format: 'protoyard/other' },
      { ...bundle, version: 2 },
      { ...bundle, extra: true },
      { ...bundle, files: [] },
      { ...bundle, texuli: { ...bundle.texuli, format: 'texuli/other' } },
      { ...bundle, designSystem: 'Not An Id' },
      {
        ...bundle,
        files: bundle.files.map((f) => (f.from ? { ...f, text: 'both' } : f)),
      },
    ]) {
      const { run } = await importTampered(bad);
      expect(run.code, JSON.stringify(bad).slice(0, 80)).toBe(4);
    }

    const target = workspace();
    const big = join(target.root, 'big.json');
    writeFileSync(big, ' '.repeat(8 * 1_048_576 + 1));
    const oversize = await ds(target, 'import', big);
    expect(oversize.code).toBe(4);
    expect(oversize.json<Envelope<Errors>>().data.errors[0]?.code).toBe('too-large');

    let deep: unknown = 'leaf';
    for (let i = 0; i < 80; i++) deep = { deep };
    const { run } = await importTampered({ ...bundle, texuli: { ...bundle.texuli, deep } });
    expect(run.json<Envelope<Errors>>().data.errors[0]?.code).toBe('too-deep');

    const notJson = join(target.root, 'broken.json');
    writeFileSync(notJson, '{');
    expect((await ds(target, 'import', notJson)).code).toBe(4);
  });

  it('refuses symlinks: a symlinked bundle file and a symlink inside the exported folder', async () => {
    const ws = await source();
    const { file } = await exported(ws);
    const target = workspace();
    const link = join(target.root, 'link.json');
    symlinkSync(file, link);
    const linked = await ds(target, 'import', link);
    expect(linked.json<Envelope<unknown>>().error?.code).toBe('unsafe_path');

    mkdirSync(join(ws.root, 'outside'), { recursive: true });
    writeFileSync(join(ws.root, 'outside/Secret.json'), '{}');
    symlinkSync(
      join(ws.root, 'outside/Secret.json'),
      join(ws.root, 'design-systems/harbor/stories/Secret.json')
    );
    const exporting = await ds(ws, 'export', 'harbor', '--bundle');
    expect(exporting.json<Envelope<unknown>>().error?.code).toBe('unsafe_path');
  });

  it('--draft and --id reset the imported approval; --id refuses release records', async () => {
    const ws = await source();
    const { file } = await exported(ws);
    const target = workspace();
    const draft = await ds(target, 'import', file, '--draft');
    expect(draft.code, draft.stdout).toBe(0);
    expect(draft.json<Envelope<{ status: string; approvalReset: boolean }>>().data).toMatchObject({
      status: 'draft',
      approvalReset: true,
    });
    const document = JSON.parse(
      readFileSync(join(target.root, 'design-systems/harbor/document.json'), 'utf8')
    ) as { approval: unknown };
    expect(document.approval).toEqual({ status: 'draft', version: '1.0.0' });
    expect((await ds(target, 'validate', 'harbor')).code).toBe(0);

    const renamed = await ds(target, 'import', file, '--id', 'harbor-copy');
    expect(renamed.json<Envelope<unknown>>().error?.code).toBe('usage');

    // Without release records, --id imports under the new id as a draft.
    const plain = workspace();
    for (const step of [
      ['new', 'tide', '--brand', '#1d4ed8', '--allow', 'minimal'],
      ['approve', 'tide', '--by', 'Ada Example'],
      ['export', 'tide', '--bundle', '--out', 'tide.json'],
    ]) {
      expect((await ds(plain, ...step)).code).toBe(0);
    }
    const copy = await ds(target, 'import', join(plain.root, 'tide.json'), '--id', 'tide-copy');
    expect(copy.code, copy.stdout).toBe(0);
    expect(copy.json<Envelope<{ status: string; id: string }>>().data).toMatchObject({
      id: 'tide-copy',
      status: 'draft',
    });
    const validated = await ds(target, 'validate', 'tide-copy');
    expect(validated.code, validated.stdout).toBe(0);
  });

  it('refuses to export a flat document or a folder with component drift', async () => {
    const ws = await source();
    ws.write('design-systems/harbor/components/StatusPill.svelte', '<p>changed</p>\n');
    const drift = await ds(ws, 'export', 'harbor', '--bundle');
    expect(drift.code).toBe(4);
    expect(drift.json<Envelope<Errors>>().data.errors.map((e) => e.code)).toContain(
      'hash-mismatch'
    );

    const flat = workspace();
    expect(
      (await ds(flat, 'new', 'reef', '--brand', '#0f766e', '--out', 'design-systems/reef.json'))
        .code
    ).toBe(0);
    expect((await ds(flat, 'export', 'reef', '--bundle')).code).toBe(2);
    expect((await ds(flat, 'export', 'reef', '--out', 'x.json')).code).toBe(2);
  });
});

describe('ds validate runs Texuli full validator over the merged catalog', {
  timeout: 120_000,
}, () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('agrees with checkDesignSystemFull and fails only with --strict', async () => {
    ws = createWorkspace();
    const root = ws.root;
    const run = (...args: string[]) => cli(['--root', root, '--json', 'ds', ...args]);
    expect((await run('new', 'harbor', '--brand', '#0f766e', '--allow', 'minimal')).code).toBe(0);
    expect((await run('approve', 'harbor', '--by', 'Ada Example')).code).toBe(0);

    type Full = { ok: boolean; codes: string[]; findings: { code: string }[] };
    const clean = await run('validate', 'harbor');
    expect(clean.code).toBe(0);
    const cleanFull = clean.json<Envelope<{ full: Full }>>().data.full;
    expect(cleanFull).toMatchObject({ ok: true, codes: [] });

    const file = join(root, 'design-systems/harbor/document.json');
    const document = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    // The minimal preset allows `protoyard:*` extension ids: without the
    // extensions merged, Texuli's catalog would refuse them.
    const inputs = dsCheckInputs();
    const bare = await checkDesignSystemFull(document, { catalog: inputs.catalog });
    expect(bare.codes).toContain('unknown-component');

    // A change after the approval: the recorded content hash goes stale.
    document.name = 'Harbor changed';
    writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    const stale = await run('validate', 'harbor');
    expect(stale.code, stale.stdout).toBe(0);
    const full = stale.json<Envelope<{ full: Full; lockable: boolean }>>().data;
    const direct = await checkDesignSystemFull(document, {
      ...inputs,
      file: 'design-systems/harbor/document.json',
    });
    expect(full.full.ok).toBe(false);
    expect(full.full.codes).toEqual(direct.codes);
    expect(full.full.findings).toEqual(direct.findings);
    expect(full.full.codes).toContain('content-hash-mismatch');
    expect(full.lockable).toBe(false);

    const strict = await run('validate', 'harbor', '--strict');
    expect(strict.code).toBe(4);
    expect(strict.json<Envelope<unknown>>().error?.message).toContain('content-hash-mismatch');
  });
});
