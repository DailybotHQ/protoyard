// @vitest-environment node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { designSystemContentHash } from '@texuli/spec/design-system';
import { afterEach, describe, expect, it } from 'vitest';
import { ComponentStorySchema } from '../src/lib/ds-contracts.ts';
import { escapeMarkdown } from '../src/lib/ds-kit.ts';
import { jsonErrorText } from '../src/lib/json-error.ts';
import { createMcpToolHandler, runCliEnvelope } from '../src/mcp/tools.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * Regression tests for the PLAN_013 security review (1.8.1):
 * - F3: `ds new --out`, MCP `ds_create.out` and `ds export --bundle --out`
 *   write only under design-systems/, artifacts/ or tmp/, never a protected
 *   name, and `--force` replaces only a file of the same kind;
 * - F10: `check ds --write-baseline` and `ds extensions --out` use the same
 *   locations and need `--force` for a file of another kind;
 * - F6: a parse error never quotes the file, and hidden files are never
 *   generator inputs;
 * - F1, F5, F11: `ds import` lists the component code to review, checks every
 *   release record against its document and the bundle history, and refuses
 *   a library source referenced twice;
 * - F12: the kit README escapes the design-system name, and a story prop
 *   never carries a script-capable URL.
 */

type Envelope<T = Record<string, unknown>> = {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; hint?: string; data?: unknown };
};
type BundleFile = { path: string; sha256: string; bytes: number; text?: string; from?: string };
type Bundle = {
  texuli: { librarySources: { id: string }[]; history: { version: string }[] };
  files: BundleFile[];
};
type Issues = { errors: { code: string; path: string; message: string }[] };

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
/** Stands in for a secret file's first line (fictional; Node quotes about 10 characters). */
const PRIVATE_LINE = 'PRIVATEMARK fictional line';

const spaces: TempWorkspace[] = [];
afterEach(() => {
  for (const ws of spaces.splice(0)) ws.cleanup();
});
function workspace(): TempWorkspace {
  const ws = createWorkspace();
  spaces.push(ws);
  return ws;
}
const run = (ws: TempWorkspace, ...args: string[]) => cli(['--root', ws.root, '--json', ...args]);
const errorOf = async (pending: ReturnType<typeof run>) => (await pending).json<Envelope>().error;

/** An approved folder with one component and a release. */
async function harbor(ws: TempWorkspace): Promise<void> {
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
    ['approve', 'harbor', '--by', 'Ada Example', '--release', '1.0.0', '--changelog', 'First.'],
  ];
  for (const step of steps) {
    const result = await run(ws, 'ds', ...step);
    expect(result.code, `${step.join(' ')}: ${result.stdout}`).toBe(0);
  }
}

describe('F3: design-system outputs stay in design-systems/, artifacts/ or tmp/', () => {
  it('ds new --out refuses protected names and source folders, and --force replaces only a design system', async () => {
    const ws = workspace();
    const pkg = readFileSync(join(ws.root, 'package.json'), 'utf8');
    const refused = [
      'package.json',
      'tsconfig.base.json',
      '.github/workflows/ci.json',
      'prototypes/acme/src/data.json',
      'flat.json',
      'tmp/node_modules/x.json',
      '../outside.json',
    ];
    for (const out of refused) {
      const error = await errorOf(
        run(ws, 'ds', 'new', 'other', '--brand', '#123456', '--out', out, '--force')
      );
      expect(error?.code, out).toBe('unsafe_path');
    }
    expect(readFileSync(join(ws.root, 'package.json'), 'utf8')).toBe(pkg);
    expect(existsSync(join(ws.root, '.github'))).toBe(false);
    expect(
      (await errorOf(run(ws, 'ds', 'new', 'other', '--brand', '#123456', '--out', 'tmp/a.css')))
        ?.code
    ).toBe('usage');

    for (const out of ['tmp/flat.json', 'design-systems/flat.json', 'artifacts/ds/flat.json']) {
      const made = await run(ws, 'ds', 'new', 'flat', '--brand', '#123456', '--out', out);
      expect(made.code, made.stdout).toBe(0);
    }
    expect(
      (await errorOf(run(ws, 'ds', 'new', 'flat', '--brand', '#123456', '--out', 'tmp/flat.json')))
        ?.code
    ).toBe('conflict');
    const replaced = await run(
      ws,
      'ds',
      'new',
      'flat',
      '--brand',
      '#123456',
      '--out',
      'tmp/flat.json',
      '--force'
    );
    expect(replaced.code, replaced.stdout).toBe(0);
    ws.write('tmp/notes.json', { notes: ['keep me'] });
    const other = await errorOf(
      run(ws, 'ds', 'new', 'flat', '--brand', '#123456', '--out', 'tmp/notes.json', '--force')
    );
    expect(other?.code).toBe('conflict');
    expect(JSON.parse(readFileSync(join(ws.root, 'tmp/notes.json'), 'utf8'))).toEqual({
      notes: ['keep me'],
    });
  });

  it('MCP ds_create.out follows the same rules', async () => {
    const ws = workspace();
    const handler = createMcpToolHandler({
      workspaceRoot: ws.root,
      runCli: (args) => runCliEnvelope(['--root', ws.root, ...args]),
    });
    const pkg = readFileSync(join(ws.root, 'package.json'), 'utf8');
    const clobber = await handler('ds_create', {
      id: 'evil',
      brand: '#123456',
      out: 'package.json',
      force: true,
    });
    expect(clobber).toMatchObject({ ok: false, error: { code: 'unsafe_path' } });
    expect(readFileSync(join(ws.root, 'package.json'), 'utf8')).toBe(pkg);
    const allowed = await handler('ds_create', {
      id: 'fine',
      brand: '#123456',
      out: 'design-systems/fine.json',
    });
    expect(allowed).toMatchObject({ ok: true });
    expect(existsSync(join(ws.root, 'design-systems/fine.json'))).toBe(true);
  });

  it('ds export --bundle --out writes only a guarded .json and --force replaces only a bundle', async () => {
    const ws = workspace();
    await harbor(ws);
    for (const out of ['package.json', '.github/workflows/ci.json', 'harbor.json']) {
      const error = await errorOf(
        run(ws, 'ds', 'export', 'harbor', '--bundle', '--out', out, '--force')
      );
      expect(error?.code, out).toBe('unsafe_path');
    }
    expect(
      (await errorOf(run(ws, 'ds', 'export', 'harbor', '--bundle', '--out', 'tmp/ci.yml')))?.code
    ).toBe('usage');
    const first = await run(ws, 'ds', 'export', 'harbor', '--bundle', '--out', 'tmp/b.json');
    expect(first.code, first.stdout).toBe(0);
    const again = await run(
      ws,
      'ds',
      'export',
      'harbor',
      '--bundle',
      '--out',
      'tmp/b.json',
      '--force'
    );
    expect(again.code, again.stdout).toBe(0);
    ws.write('tmp/doc.json', { format: 'texuli/design-system', id: 'x' });
    expect(
      (
        await errorOf(
          run(ws, 'ds', 'export', 'harbor', '--bundle', '--out', 'tmp/doc.json', '--force')
        )
      )?.code
    ).toBe('conflict');
  });
});

describe('F10: baselines and extension files', () => {
  it('check ds --write-baseline refuses protected names and another kind of file without --force', async () => {
    const ws = workspace();
    const pkg = readFileSync(join(ws.root, 'package.json'), 'utf8');
    for (const out of ['package.json', 'prototypes/a/baseline.json', 'baseline.json']) {
      const error = await errorOf(
        run(ws, 'check', 'ds', '--render', '--write-baseline', out, '--force')
      );
      expect(error?.code, out).toBe('unsafe_path');
    }
    expect(readFileSync(join(ws.root, 'package.json'), 'utf8')).toBe(pkg);
    ws.write('design-systems/notes.json', { notes: [] });
    const other = await errorOf(
      run(ws, 'check', 'ds', '--render', '--write-baseline', 'design-systems/notes.json')
    );
    expect(other?.code).toBe('conflict');
    // Nothing is locked: no browser starts, and the guarded path is accepted.
    const forced = await run(
      ws,
      'check',
      'ds',
      '--render',
      '--write-baseline',
      'design-systems/notes.json',
      '--force'
    );
    expect(forced.json<Envelope>().error?.code).not.toBe('conflict');
    expect(forced.json<Envelope>().error?.code).not.toBe('unsafe_path');
  });

  it('ds extensions --out writes under guarded folders and replaces another file only with --force', async () => {
    const ws = workspace();
    expect((await errorOf(run(ws, 'ds', 'extensions', '--out', 'src')))?.code).toBe('unsafe_path');
    expect((await errorOf(run(ws, 'ds', 'extensions', '--out', '.github')))?.code).toBe(
      'unsafe_path'
    );
    expect((await run(ws, 'ds', 'extensions', '--out', 'tmp/ext')).code).toBe(0);
    // A rerun replaces its own extension file.
    expect((await run(ws, 'ds', 'extensions', '--out', 'tmp/ext')).code).toBe(0);
    ws.write('tmp/other/protoyard.catalog-extension.json', { mine: true });
    expect((await errorOf(run(ws, 'ds', 'extensions', '--out', 'tmp/other')))?.code).toBe(
      'conflict'
    );
    expect(
      JSON.parse(readFileSync(join(ws.root, 'tmp/other/protoyard.catalog-extension.json'), 'utf8'))
    ).toEqual({ mine: true });
    expect((await run(ws, 'ds', 'extensions', '--out', 'tmp/other', '--force')).code).toBe(0);
  });
});

describe('F6: parse errors never quote untrusted files', () => {
  it('keeps only the position of a JSON error', () => {
    let error: unknown;
    try {
      JSON.parse(PRIVATE_LINE);
    } catch (caught) {
      error = caught;
    }
    expect(String((error as Error).message)).toContain('PRIVATEMAR');
    const text = jsonErrorText(error);
    expect(text).not.toContain('PRIVATEMAR');
    expect(text).toMatch(/^not valid JSON/);
    expect(jsonErrorText(new SyntaxError('Bad thing in JSON at position 12'))).toBe(
      'not valid JSON (at position 12)'
    );
  });

  it('refuses hidden generator inputs and echoes nothing of a non-JSON file', async () => {
    const ws = workspace();
    writeFileSync(join(ws.root, '.env'), `${PRIVATE_LINE}\n`);
    writeFileSync(join(ws.root, 'notes.json'), `${PRIVATE_LINE}\n`);
    ws.write('design-systems/leak/document.json', 'placeholder');
    writeFileSync(join(ws.root, 'design-systems/leak/document.json'), `${PRIVATE_LINE}\n`);

    const hidden = await run(ws, 'ds', 'new', 'leak', '--from-tokens', '.env');
    expect(hidden.json<Envelope>().error?.code).toBe('unsafe_path');
    const hiddenCss = await run(ws, 'ds', 'new', 'leak', '--from-css', '.env');
    expect(hiddenCss.json<Envelope>().error?.code).toBe('unsafe_path');

    const outputs = [
      hidden,
      hiddenCss,
      await run(ws, 'ds', 'new', 'leak2', '--from-tokens', 'notes.json'),
      await run(ws, 'ds', 'new', 'leak3', '--brand', '#123456', '--allow', 'notes.json'),
      await run(ws, 'ds', 'validate', 'notes.json'),
      await run(ws, 'ds', 'validate', 'leak'),
      await run(ws, 'ds', 'import', 'notes.json'),
    ];
    for (const output of outputs) {
      expect(output.code).not.toBe(0);
      expect(output.stdout).not.toContain('PRIVATEMAR');
    }
  });
});

describe('ds import: component code, release records and repeated sources', {
  timeout: 120_000,
}, () => {
  /** Exports harbor and returns the bundle and a writer for a modified copy. */
  async function exported() {
    const ws = workspace();
    await harbor(ws);
    const made = await run(ws, 'ds', 'export', 'harbor', '--bundle', '--out', 'tmp/h.json');
    expect(made.code, made.stdout).toBe(0);
    const bundle = JSON.parse(readFileSync(join(ws.root, 'tmp/h.json'), 'utf8')) as Bundle;
    const save = (value: Bundle, name: string) => {
      writeFileSync(join(ws.root, 'tmp', name), JSON.stringify(value));
      return `tmp/${name}`;
    };
    return { ws, bundle, save };
  }

  it('lists every component source with its size and the review note (F1), and the releases (F5)', async () => {
    const { ws } = await exported();
    const target = workspace();
    const imported = await run(target, 'ds', 'import', join(ws.root, 'tmp/h.json'), '--dry-run');
    expect(imported.code, imported.stdout).toBe(0);
    const data =
      imported.json<
        Envelope<{
          components: { path: string; bytes: number }[];
          componentsNote: string;
          releases: string[];
          releasesNote: string;
        }>
      >().data;
    expect(data.components).toHaveLength(1);
    expect(data.components[0]?.path).toBe('design-systems/harbor/components/StatusPill.svelte');
    expect(data.components[0]?.bytes).toBeGreaterThan(0);
    expect(data.componentsNote).toContain('Review this code before `protoyard ds kit`');
    expect(data.releases).toEqual(['design-systems/harbor/releases/1.0.0.json']);
    expect(data.releasesNote).toContain('not a proof');

    const text = await cli(['--root', target.root, 'ds', 'import', join(ws.root, 'tmp/h.json')]);
    expect(text.code, text.stdout).toBe(0);
    expect(text.stdout).toContain('design-systems/harbor/components/StatusPill.svelte (');
    expect(text.stdout).toContain('Review this code before');
  });

  it('refuses a release whose hash does not match its document, or that the history does not list (F5)', async () => {
    const { ws, bundle, save } = await exported();
    const release = bundle.files.find((f) => f.path === 'releases/1.0.0.json') as BundleFile;
    const record = JSON.parse(release.text as string) as Record<string, unknown>;
    const add = (value: Record<string, unknown>, path: string): Bundle => {
      const text = `${JSON.stringify(value, null, 2)}\n`;
      return {
        ...bundle,
        files: [
          ...bundle.files,
          { path, text, sha256: sha(text), bytes: Buffer.byteLength(text, 'utf8') },
        ],
      };
    };
    const document = { ...(record.document as Record<string, unknown>), version: '0.9.0' };
    const forged = add(
      {
        ...record,
        release: '0.9.0',
        approvedBy: 'Chief Designer',
        contentHash: 'a'.repeat(64),
        document,
      },
      'releases/0.9.0.json'
    );
    const bad = await run(
      ws,
      'ds',
      'import',
      save(forged, 'forged.json'),
      '--id',
      'harbor',
      '--dry-run',
      '--force'
    );
    expect(bad.code).not.toBe(0);
    const badCodes = bad.json<Envelope<Issues>>().data.errors.map((e) => e.code);
    expect(badCodes).toContain('release-mismatch');

    const consistent = add(
      {
        ...record,
        release: '0.9.0',
        contentHash: designSystemContentHash(structuredClone(document) as never),
        document,
      },
      'releases/0.9.0.json'
    );
    const unlisted = await run(
      ws,
      'ds',
      'import',
      save(consistent, 'unlisted.json'),
      '--dry-run',
      '--force'
    );
    expect(unlisted.code).not.toBe(0);
    const unlistedErrors = unlisted.json<Envelope<Issues>>().data.errors;
    expect(unlistedErrors.map((e) => e.code)).toEqual(['release-not-in-history']);
  });

  it('refuses a library source referenced twice before building its copies (F11)', async () => {
    const { ws, bundle, save } = await exported();
    const component = bundle.files.find((f) => f.from?.startsWith('library:')) as BundleFile;
    const twice: Bundle = {
      ...bundle,
      files: [...bundle.files, { ...component, path: 'components/StatusPillCopy.svelte' }],
    };
    const result = await run(ws, 'ds', 'import', save(twice, 'twice.json'), '--dry-run', '--force');
    expect(result.code).not.toBe(0);
    const codes = result.json<Envelope<Issues>>().data.errors.map((e) => e.code);
    expect(codes).toContain('duplicate-reference');
  });
});

describe('F12: kit README and story props', () => {
  it('escapes the design-system name as Markdown text', () => {
    expect(escapeMarkdown('Harbor Labs')).toBe('Harbor Labs');
    const hostile = escapeMarkdown('Acme](https://example.com) <img src=x>\n# Owned');
    expect(hostile).not.toContain('\n');
    expect(hostile).toBe('Acme\\]\\(https://example.com\\) \\<img src=x\\> \\# Owned');
  });

  it('refuses javascript:-style URLs anywhere in story props', () => {
    const story = (props: Record<string, unknown>) =>
      ComponentStorySchema.safeParse({
        format: 'protoyard/ds-story',
        version: 1,
        component: 'StatusPill',
        variants: [{ name: 'Default', props }],
      }).success;
    expect(story({ label: 'Open', href: 'https://example.com/help', note: 'Ratio: 2' })).toBe(true);
    expect(story({ href: 'javascript:alert(1)' })).toBe(false);
    expect(story({ href: ' Java\tScript:alert(1)' })).toBe(false);
    expect(story({ links: [{ href: 'vbscript:x' }] })).toBe(false);
    expect(story({ image: { src: 'data:text/html,<b>x</b>' } })).toBe(false);
    let deep: Record<string, unknown> = { value: 'ok' };
    for (let i = 0; i < 12; i += 1) deep = { deep };
    expect(story(deep)).toBe(false);
  });
});

describe('ds approve --release: the release is made before the document changes', () => {
  const status = (ws: TempWorkspace) =>
    (
      JSON.parse(readFileSync(join(ws.root, 'design-systems/harbor/document.json'), 'utf8')) as {
        approval?: { status?: string };
      }
    ).approval?.status;

  it('leaves the document unapproved when the release cannot be built or written', async () => {
    const ws = workspace();
    expect((await run(ws, 'ds', 'new', 'harbor', '--brand', '#0f766e')).code).toBe(0);
    expect(status(ws)).toBe('draft');

    // The record cannot be built: components.json fails its schema.
    const components = join(ws.root, 'design-systems/harbor/components.json');
    const good = readFileSync(components, 'utf8');
    writeFileSync(components, JSON.stringify({ format: 'not-components' }));
    const unbuilt = await run(
      ws,
      'ds',
      'approve',
      'harbor',
      '--by',
      'Ada Example',
      '--release',
      '1.0.0'
    );
    expect(unbuilt.code).not.toBe(0);
    expect(status(ws)).toBe('draft');
    writeFileSync(components, good);

    // The record cannot be written: releases/ is a symlink.
    const outside = mkdtempSync(join(tmpdir(), 'protoyard-releases-'));
    try {
      symlinkSync(outside, join(ws.root, 'design-systems/harbor/releases'), 'dir');
      const unwritten = await run(
        ws,
        'ds',
        'approve',
        'harbor',
        '--by',
        'Ada Example',
        '--release',
        '1.0.0'
      );
      expect(unwritten.json<Envelope>().error?.code).toBe('unsafe_path');
      expect(status(ws)).toBe('draft');
      expect(readdirSync(outside)).toEqual([]);
    } finally {
      rmSync(join(ws.root, 'design-systems/harbor/releases'), { force: true });
      rmSync(outside, { recursive: true, force: true });
    }
    const approved = await run(
      ws,
      'ds',
      'approve',
      'harbor',
      '--by',
      'Ada Example',
      '--release',
      '1.0.0'
    );
    expect(approved.code, approved.stdout).toBe(0);
    expect(status(ws)).toBe('approved');
  });
});
