// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { importBrand } from '@texuli/tokens/design-system/import';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GENERATOR_LIMITS,
  readProseBrief,
  setDsBriefStdin,
  svgLogoColors,
} from '../src/lib/ds-generate.ts';
import { cliArgs, createMcpToolHandler, runCliEnvelope } from '../src/mcp/tools.ts';
import { cli, createWorkspace, manifest, type TempWorkspace } from './helpers.ts';

vi.setConfig({ testTimeout: 60_000 });

type Report = {
  losses: { path: string; reason: string }[];
  repairs: { path: string; reason: string }[];
  guarantees: { passed: boolean; issues: unknown[] };
};
type Generated = {
  id: string;
  name: string;
  status: string;
  written: boolean;
  file: string;
  source: string;
  generation: Report & {
    source: string;
    file?: string;
    brief?: { from: string; oneLiner: string; reading: { clause: string; read: string[] }[] };
    logo?: { format: string; colors: { color: string; count: number }[]; ignored: number };
  };
  document: {
    color?: { brand?: { seed?: string; secondary?: string } };
    typography?: { families?: { sans?: { stack?: string[] } } };
    shape?: { radius?: number };
    approval?: { status?: string; approvedBy?: string };
  };
};
type Envelope<T> = {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; data?: Record<string, unknown> };
};

/** Fictional fixtures: a DTCG file, a site stylesheet, an SVG logo and a brief. */
const TOKENS = {
  color: {
    brand: { $type: 'color', $value: '#7c3aed' },
  },
  font: { body: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] } },
  radius: { $type: 'dimension', $value: { value: 6, unit: 'px' } },
  mascot: { $type: 'number', $value: 3 },
};
const CSS = `:root {
  --brand: #e11d48;
  --font-sans: "Geist", sans-serif;
  --radius: 6px;
}
body { font-family: Inter; }
`;
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <script>alert("never run")</script>
  <rect width="64" height="64" fill="#ffffff"/>
  <circle cx="20" cy="32" r="12" fill="#0f766e"/>
  <circle cx="44" cy="32" r="12" style="fill: #0f766e; stroke: rgb(245, 158, 11)"/>
  <path d="M0 0h8v8z" fill="url(#grad)" stroke="none"/>
</svg>
`;
const BRIEF =
  'A calm banking app for nurses. Deep teal #0f766e brand, Inter font, rounded corners and compact spacing.';

let ws: TempWorkspace | undefined;
afterEach(() => {
  ws?.cleanup();
  ws = undefined;
});

const root = () => (ws as TempWorkspace).root;
const run = (...args: string[]) => cli(['--root', root(), '--json', ...args]);
const ds = (...args: string[]) => run('ds', ...args);
const read = (path: string) => readFileSync(join(root(), path), 'utf8');

function setup() {
  ws = createWorkspace();
  ws.write('brand/tokens.example.json', TOKENS);
  ws.write('brand/site.css', CSS);
  ws.write('brand/logo.svg', LOGO);
  ws.write('brand/brief.md', `${BRIEF}\n`);
}

function expectReports(data: Generated) {
  expect(data.status).toBe('draft');
  expect(Array.isArray(data.generation.losses)).toBe(true);
  expect(Array.isArray(data.generation.repairs)).toBe(true);
  expect(data.generation.repairs.length).toBeGreaterThan(0);
  expect(data.generation.guarantees.passed).toBe(true);
  expect(data.document.approval?.status).toBe('draft');
}

describe('protoyard ds new from Texuli generator sources (PLAN_013 T-generator)', () => {
  it('generates a draft from a DTCG tokens file, with the loss and AA repair reports', async () => {
    setup();
    const result = await ds('new', 'tokens-ds', '--from-tokens', 'brand/tokens.example.json');
    expect(result.code, result.stdout).toBe(0);
    const data = result.json<Envelope<Generated>>().data;
    expectReports(data);
    expect(data.source).toBe('tokens');
    expect(data.generation.file).toBe('brand/tokens.example.json');
    expect(data.name).toBe('Tokens Ds');
    expect(data.document.color?.brand?.seed).toBe('#7c3aed');
    expect(data.document.typography?.families?.sans?.stack).toEqual(['Inter', 'sans-serif']);
    expect(data.document.shape?.radius).toBe(6);
    expect(data.generation.losses.map((loss) => loss.path)).toContain('$.mascot');
    expect(existsSync(join(root(), 'design-systems/tokens-ds/document.json'))).toBe(true);
  });

  it('generates from a stylesheet read as text and reports what a later value replaced', async () => {
    setup();
    const result = await ds('new', 'css-ds', '--from-css', 'brand/site.css', '--name', 'Rose Site');
    expect(result.code, result.stdout).toBe(0);
    const data = result.json<Envelope<Generated>>().data;
    expectReports(data);
    expect(data.name).toBe('Rose Site');
    expect(data.document.color?.brand?.seed).toBe('#e11d48');
    expect(data.document.shape?.radius).toBe(6);
    expect(data.generation.losses.some((loss) => loss.path.includes('font-family'))).toBe(true);

    // An @import makes the stylesheet unreadable for Texuli: refused, nothing written.
    ws?.write(
      'brand/import.css',
      '@import url("https://assets.example/x.css");\n:root{--brand:#e11d48}'
    );
    const refused = await ds('new', 'import-ds', '--from-css', 'brand/import.css');
    expect(refused.code).not.toBe(0);
    const envelope = refused.json<Envelope<{ errors: { code: string }[]; report: Report }>>();
    expect(envelope.error?.code).toBe('validation');
    expect(envelope.data.errors[0]?.code).toBe('invalid-input');
    expect(envelope.data.report.losses).toEqual([]);
    expect(existsSync(join(root(), 'design-systems/import-ds'))).toBe(false);
  });

  it('derives the palette from an SVG logo read as text, and refuses raster logos', async () => {
    setup();
    const result = await ds('new', 'logo-ds', '--from-logo', 'brand/logo.svg');
    expect(result.code, result.stdout).toBe(0);
    const data = result.json<Envelope<Generated>>().data;
    expectReports(data);
    expect(data.generation.logo?.format).toBe('svg');
    expect(data.generation.logo?.colors).toEqual([
      { color: '#ffffff', count: 1 },
      { color: '#0f766e', count: 2 },
      { color: '#f59e0b', count: 1 },
    ]);
    expect(data.generation.logo?.ignored).toBe(2);
    expect(data.document.color?.brand?.seed).toBe('#0f766e');
    expect(data.document.color?.brand?.secondary).toBe('#f59e0b');

    ws?.write('brand/logo.png', '\x89PNG\r\n\x1a\nfictional');
    const png = await ds('new', 'png-ds', '--from-logo', 'brand/logo.png');
    expect(png.code).not.toBe(0);
    expect(png.json<Envelope<unknown>>().error?.message).toContain('SVG logos only');
    ws?.write(
      'brand/blank.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="none"/></svg>'
    );
    const blank = await ds('new', 'blank-ds', '--from-logo', 'brand/blank.svg');
    expect(blank.code).not.toBe(0);
    expect(blank.json<Envelope<unknown>>().error?.message).toContain('no fill or stroke colors');
  });

  it('reads a prose brief from text, a file or stdin into the same draft', async () => {
    setup();
    const text = await ds('new', 'nurse-bank', '--brief', BRIEF, '--dry-run');
    expect(text.code, text.stdout).toBe(0);
    const data = text.json<Envelope<Generated>>().data;
    expectReports(data);
    expect(data.generation.brief?.from).toBe('text');
    expect(data.document.color?.brand?.seed).toBe('#0f766e');
    expect(data.document.typography?.families?.sans?.stack?.[0]).toBe('Inter');
    expect(data.generation.brief?.oneLiner).toBe(
      'calm, brand #0f766e, font Inter, rounded, compact'
    );
    expect(data.generation.brief?.reading[0]).toEqual({
      clause: 'A calm banking app for nurses',
      read: ['calm'],
    });

    const file = await ds('new', 'nurse-bank', '--brief', 'brand/brief.md', '--dry-run');
    expect(file.code, file.stdout).toBe(0);
    const fromFile = file.json<Envelope<Generated>>().data;
    expect(fromFile.generation.brief?.from).toBe('file');
    expect(fromFile.document).toEqual(data.document);

    const restore = setDsBriefStdin(Readable.from([BRIEF]));
    try {
      const stdin = await ds('new', 'nurse-bank', '--brief', '-', '--dry-run');
      expect(stdin.code, stdin.stdout).toBe(0);
      const fromStdin = stdin.json<Envelope<Generated>>().data;
      expect(fromStdin.generation.brief?.from).toBe('stdin');
      expect(fromStdin.document).toEqual(data.document);
    } finally {
      restore();
    }

    // The brand flags still win over the brief (they are added after it).
    const flagged = await ds(
      'new',
      'nurse-bank',
      '--brief',
      BRIEF,
      '--brand',
      '#1d4ed8',
      '--dry-run'
    );
    expect(flagged.code, flagged.stdout).toBe(0);
    expect(flagged.json<Envelope<Generated>>().data.document.color?.brand?.seed).toBe('#1d4ed8');
  });

  it('is deterministic: the same input writes the same bytes', async () => {
    setup();
    const sources: [string, string][] = [
      ['--from-tokens', 'brand/tokens.example.json'],
      ['--from-css', 'brand/site.css'],
      ['--from-logo', 'brand/logo.svg'],
      ['--brief', BRIEF],
    ];
    for (const [flag, value] of sources) {
      const first = await ds('new', 'same-ds', flag, value, '--force');
      expect(first.code, first.stdout).toBe(0);
      const bytes = read('design-systems/same-ds/document.json');
      const second = await ds('new', 'same-ds', flag, value, '--force');
      expect(second.code, second.stdout).toBe(0);
      expect(read('design-systems/same-ds/document.json')).toBe(bytes);
      expect(second.json<Envelope<Generated>>().data.generation).toEqual(
        first.json<Envelope<Generated>>().data.generation
      );
    }
  });

  it('never carries an approval from the input: the result is a draft', async () => {
    setup();
    ws?.write('brand/approved.json', {
      ...TOKENS,
      $extensions: {
        'com.texuli.design-system': {
          approval: {
            status: 'approved',
            version: '1.0.0',
            approvedBy: 'Mallory Example',
            approvedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    });
    const result = await ds('new', 'sneaky', '--from-tokens', 'brand/approved.json');
    expect(result.code, result.stdout).toBe(0);
    const document = JSON.parse(
      read('design-systems/sneaky/document.json')
    ) as Generated['document'];
    expect(document.approval?.status).toBe('draft');
    expect(document.approval?.approvedBy).toBeUndefined();
  });

  it('refuses a missing file, a file too large, a path outside the workspace and two sources', async () => {
    setup();
    const missing = await ds('new', 'x-ds', '--from-tokens', 'brand/missing.json');
    expect(missing.json<Envelope<unknown>>().error?.code).toBe('not_found');

    ws?.write('brand/huge.svg', `<svg>${' '.repeat(GENERATOR_LIMITS.logo)}</svg>`);
    const huge = await ds('new', 'x-ds', '--from-logo', 'brand/huge.svg');
    expect(huge.json<Envelope<unknown>>().error?.code).toBe('validation');
    expect(huge.json<Envelope<unknown>>().error?.message).toContain('larger than 512 KiB');
    ws?.write('brand/huge.md', 'x'.repeat(GENERATOR_LIMITS.brief + 1));
    expect((await ds('new', 'x-ds', '--brief', 'brand/huge.md')).code).not.toBe(0);

    const outside = await ds('new', 'x-ds', '--from-css', '../outside.css');
    expect(outside.json<Envelope<unknown>>().error?.code).toBe('unsafe_path');

    const elsewhere = mkdtempSync(join(tmpdir(), 'protoyard-ds-outside-'));
    try {
      ws?.write('brand/.keep', '');
      symlinkSync(join(elsewhere), join(root(), 'brand/linked'));
      ws?.write('brand/linked/site.css', CSS);
      const linked = await ds('new', 'x-ds', '--from-css', 'brand/linked/site.css');
      expect(linked.json<Envelope<unknown>>().error?.code).toBe('unsafe_path');
      symlinkSync(join(root(), 'brand/site.css'), join(root(), 'brand/alias.css'));
      const alias = await ds('new', 'x-ds', '--from-css', 'brand/alias.css');
      expect(alias.json<Envelope<unknown>>().error?.code).toBe('unsafe_path');
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }

    const two = await ds(
      'new',
      'x-ds',
      '--from-tokens',
      'brand/tokens.example.json',
      '--from-css',
      'brand/site.css'
    );
    expect(two.json<Envelope<unknown>>().error?.code).toBe('usage');
    expect(two.json<Envelope<unknown>>().error?.message).toContain(
      'not --from-tokens and --from-css'
    );
    const briefAndLogo = await ds('new', 'x-ds', '--brief', BRIEF, '--from-logo', 'brand/logo.svg');
    expect(briefAndLogo.json<Envelope<unknown>>().error?.code).toBe('usage');
    const withTheme = await ds(
      'new',
      'x-ds',
      '--from-css',
      'brand/site.css',
      '--from-theme',
      'ocean'
    );
    expect(withTheme.json<Envelope<unknown>>().error?.code).toBe('usage');
    const withFlags = await ds('new', 'x-ds', '--from-css', 'brand/site.css', '--brand', '#000000');
    expect(withFlags.json<Envelope<unknown>>().error?.code).toBe('usage');
    expect(existsSync(join(root(), 'design-systems'))).toBe(false);
  });

  it('--dry-run writes nothing', async () => {
    setup();
    for (const [flag, value] of [
      ['--from-tokens', 'brand/tokens.example.json'],
      ['--from-css', 'brand/site.css'],
      ['--from-logo', 'brand/logo.svg'],
      ['--brief', 'brand/brief.md'],
    ] as const) {
      const result = await ds('new', 'dry-ds', flag, value, '--dry-run');
      expect(result.code, result.stdout).toBe(0);
      expect(result.json<Envelope<Generated>>().data.written).toBe(false);
    }
    expect(existsSync(join(root(), 'design-systems'))).toBe(false);
    expect(readdirSync(join(root(), 'brand')).sort()).toEqual([
      'brief.md',
      'logo.svg',
      'site.css',
      'tokens.example.json',
    ]);
  });

  it('prints both reports in text mode', async () => {
    setup();
    const result = await cli([
      '--root',
      root(),
      'ds',
      'new',
      'text-ds',
      '--from-logo',
      'brand/logo.svg',
    ]);
    expect(result.code, result.stdout).toBe(0);
    expect(result.stdout).toContain('generated by Texuli from --from-logo brand/logo.svg · draft');
    expect(result.stdout).toContain('loss report:');
    expect(result.stdout).toMatch(/AA repair report: \d+ repair\(s\) · guarantees pass/);
  });

  it('new --ds refuses the generated draft until ds approve', async () => {
    setup();
    const base = 'templates/blank';
    ws?.write(
      `${base}/protoyard.json`,
      manifest({ id: 'template.blank', slug: 'blank', kind: 'template', name: 'Fixture blank' })
    );
    ws?.write(`${base}/package.json`, {
      name: '@protoyard-template/blank',
      private: true,
      dependencies: { '@protoyard/runtime': 'workspace:*' },
    });
    ws?.write(`${base}/README.md`, '# Fixture blank\n');
    ws?.write(
      `${base}/src/prototype.ts`,
      "import { definePrototype, parseManifest } from '@protoyard/core';\nimport manifestJson from '../protoyard.json';\n\nexport const definition = definePrototype({\n  manifest: parseManifest(manifestJson),\n});\n"
    );
    ws?.write(
      `${base}/src/App.svelte`,
      '<script lang="ts">\nimport { Card } from \'texuli/card\';\n</script>\n\n<div class="grid gap-4 p-3">\n  <Card>Shifts</Card>\n</div>\n'
    );
    ws?.write(`${base}/src/main.ts`, "import './app.css';\n");
    ws?.write(`${base}/src/app.css`, '.page {\n  display: grid;\n}\n');

    const created = await ds('new', 'nurse-bank', '--brief', 'brand/brief.md');
    expect(created.code, created.stdout).toBe(0);
    const draft = await run('new', 'nurse-app', '--ds', 'nurse-bank', '--no-install');
    expect(draft.code).not.toBe(0);
    expect(draft.json<Envelope<unknown>>().error?.message).toContain('is a draft');
    expect(existsSync(join(root(), 'prototypes/nurse-app'))).toBe(false);

    const approved = await ds('approve', 'nurse-bank', '--by', 'Ada Example');
    expect(approved.code, approved.stdout).toBe(0);
    const made = await run('new', 'nurse-app', '--ds', 'nurse-bank', '--no-install');
    expect(made.code, made.stdout).toBe(0);
    expect(JSON.parse(read('prototypes/nurse-app/protoyard.json')).designSystem).toMatchObject({
      id: 'nurse-bank',
      locked: true,
    });
  });
});

describe('generator input helpers', () => {
  it('reads one-liner clauses as written and prose clauses by their words', () => {
    expect(readProseBrief('brand #4f46e5, font Inter, rounded', importBrand).oneLiner).toBe(
      'brand #4f46e5, font Inter, rounded'
    );
    const { reading } = readProseBrief(
      'Headings in Fraunces; accent color #f59e0b; subtle motion and glass surfaces',
      importBrand
    );
    expect(reading.map((entry) => entry.read)).toEqual([
      ['heading Fraunces'],
      ['accent color #f59e0b'],
      ['subtle motion'],
      ['glass'],
    ]);
  });

  it('keeps a clause with nothing to read, so Texuli reports it as an unmapped loss', () => {
    const { oneLiner, reading } = readProseBrief('For night shifts, brand #0f766e', importBrand);
    expect(reading[0]).toEqual({ clause: 'For night shifts', read: [] });
    expect(oneLiner).toBe('For night shifts, brand #0f766e');
    const brand = importBrand(oneLiner, { id: 'x' });
    expect(brand.losses.map((loss) => loss.path)).toContain('$[0]');
  });

  it('reads SVG colors without markup parsing, ignoring references and none', () => {
    expect(
      svgLogoColors(
        '<svg><g fill="#0F766E" stroke="currentColor"/><stop stop-color="#abc"/><g style="fill:rgba(0,0,0,0)"/></svg>'
      )
    ).toEqual({
      colors: [
        { color: '#0f766e', count: 1 },
        { color: '#aabbcc', count: 1 },
      ],
      ignored: 2,
    });
  });
});

describe('ds_create over MCP with generator sources', () => {
  it('passes the source as one option, refuses stdin and two sources, and stays a draft', async () => {
    setup();
    expect(cliArgs('ds_create', { id: 'x', fromLogo: 'brand/logo.svg', dryRun: true })).toEqual([
      'ds',
      'new',
      '--from-logo=brand/logo.svg',
      '--dry-run',
      '--',
      'x',
    ]);
    const handler = createMcpToolHandler({
      workspaceRoot: root(),
      runCli: (args) => runCliEnvelope(['--root', root(), ...args]),
    });
    const created = await handler('ds_create', { id: 'mcp-logo', fromLogo: 'brand/logo.svg' });
    expect(created).toMatchObject({
      ok: true,
      command: 'ds new',
      data: { status: 'draft', source: 'logo' },
    });
    expect(await handler('ds_create', { id: 'x', brief: '-' })).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(
      await handler('ds_create', {
        id: 'x',
        fromCss: 'brand/site.css',
        fromTokens: 'brand/tokens.example.json',
      })
    ).toMatchObject({ ok: false, error: { code: 'validation' } });
  });
});
