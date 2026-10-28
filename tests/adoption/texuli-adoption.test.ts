// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkAdoption,
  scanSource,
  unitOf,
  writePending,
} from '../../scripts/check-texuli-adoption.ts';

const rules = (file: string, source: string) =>
  Object.fromEntries(scanSource(file, source).map((v) => [v.rule, v.count]));

describe('scanSource', () => {
  it('flags clsx, tailwind-merge and tailwind-variants imports', () => {
    expect(
      rules(
        'packages/x/src/a.ts',
        "import clsx from 'clsx';\nimport { twMerge } from 'tailwind-merge';"
      )
    ).toEqual({
      'legacy-import': 2,
    });
    expect(rules('packages/x/src/a.ts', "import { cx } from 'texuli/cx';")).toEqual({});
  });

  it('flags Lucide components rendered in markup but not Lucide glyphs passed to LucideIcon', () => {
    const raw = `<script lang="ts">import { Search, Bell as Ring } from '@lucide/svelte';</script>\n<Search class="size-4" /><Ring/>`;
    expect(rules('packages/ui/src/A.svelte', raw)['raw-lucide']).toBe(2);
    const bridged = `<script lang="ts">import { LucideIcon } from 'texuli/icons/lucide';\nimport { Search } from '@lucide/svelte';</script>\n<LucideIcon icon={Search} />`;
    expect(rules('packages/ui/src/A.svelte', bridged)['raw-lucide']).toBeUndefined();
  });

  it('flags var(--py-*) reads and not --tx-* reads', () => {
    expect(
      rules('packages/x/src/a.css', '.a { color: var(--py-fg); background: var( --py-bg ); }')[
        'py-token'
      ]
    ).toBe(2);
    expect(rules('packages/x/src/a.css', '.a { color: var(--tx-fg); }')).toEqual({});
  });

  it('flags native controls in markup only, ignoring comments and scripts', () => {
    const src = `<script>const html = '<button>';</script>\n<!-- <input> -->\n<button type="button">Go</button><input/><Button />`;
    expect(rules('templates/x/src/A.svelte', src)['raw-control']).toBe(2);
  });

  it('flags leaf UI-package components that compose nothing from Texuli or Protoyard', () => {
    const leaf =
      '<script lang="ts">let { label } = $props();</script>\n<span class="badge">{label}</span>';
    expect(rules('packages/ui/src/Badge.svelte', leaf)['own-component']).toBe(1);
    expect(rules('templates/x/src/Badge.svelte', leaf)['own-component']).toBeUndefined();
    const composed = `<script lang="ts">import { Badge } from 'texuli/badge';</script>\n<Badge>{label}</Badge>`;
    expect(rules('packages/ui/src/Badge.svelte', composed)['own-component']).toBeUndefined();
  });

  it('maps files to pending units', () => {
    expect(unitOf('packages/ui/src/A.svelte')).toBe('packages__ui');
    expect(unitOf('apps/gallery/src/A.astro')).toBe('apps__gallery');
    expect(unitOf('templates/blank/src/A.svelte')).toBe('templates');
    expect(unitOf('prototypes/crm-demo/src/A.svelte')).toBe('prototypes');
  });
});

describe('checkAdoption on a fixture repository', () => {
  let root = '';
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  // Composes a Texuli helper, so only the raw Lucide glyph is a violation.
  const legacy =
    "<script lang=\"ts\">import { cx } from 'texuli/cx';\nimport { Search } from '@lucide/svelte';</script>\n<Search class={cx('a')} />";

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function fixture() {
    root = mkdtempSync(join(tmpdir(), 'texuli-adoption-'));
    put('packages/ui/src/Search.svelte', legacy);
    put(
      'tests/adoption/texuli-gaps.json',
      JSON.stringify([{ id: 'G1', status: 'open', summary: 'icons' }])
    );
    put('tests/adoption/texuli-exceptions.json', '[]');
  }

  it('fails on a violation no pending list covers', () => {
    fixture();
    const report = checkAdoption({ root });
    expect(report.ok).toBe(false);
    expect(report.problems[0]).toMatch(/new raw-lucide/);
  });

  it('ratchets: a recorded violation passes, a grown one fails, strict fails until it is gone', () => {
    fixture();
    writePending(root, checkAdoption({ root }).violations, 'baseline');
    expect(checkAdoption({ root }).ok).toBe(true);
    expect(checkAdoption({ root, strict: true }).ok).toBe(false);
    put('packages/ui/src/Search.svelte', `${legacy}<Search />`);
    expect(checkAdoption({ root }).problems[0]).toMatch(/grew from 1 to 2/);
  });

  it('accepts a pending entry under --allow-gaps only while its gap is open', () => {
    fixture();
    put(
      'tests/adoption/pending/packages__ui.json',
      JSON.stringify({
        entries: [
          { file: 'packages/ui/src/Search.svelte', rule: 'raw-lucide', count: 1, gap: 'G1' },
        ],
      })
    );
    expect(checkAdoption({ root, strict: true, allowGaps: true }).ok).toBe(true);
    put(
      'tests/adoption/texuli-gaps.json',
      JSON.stringify([{ id: 'G1', status: 'fixed', summary: 'icons' }])
    );
    expect(checkAdoption({ root, strict: true, allowGaps: true }).problems[0]).toMatch(
      /gap G1 is not open/
    );
  });

  it('honors a reasoned exception and rejects one without a reason', () => {
    fixture();
    put(
      'tests/adoption/texuli-exceptions.json',
      JSON.stringify([
        {
          path: 'packages/ui/src/Search.svelte',
          rules: ['raw-lucide'],
          reason: 'device frame glyph',
        },
      ])
    );
    expect(checkAdoption({ root, strict: true }).ok).toBe(true);
    put(
      'tests/adoption/texuli-exceptions.json',
      JSON.stringify([
        { path: 'packages/ui/src/Search.svelte', rules: ['raw-lucide'], reason: ' ' },
      ])
    );
    expect(checkAdoption({ root }).problems).toContain(
      'exception packages/ui/src/Search.svelte has no reason'
    );
  });

  it('a scoped prune leaves the pending lists of other units untouched', () => {
    fixture();
    put('templates/blank/src/A.svelte', legacy);
    writePending(root, checkAdoption({ root }).violations, 'baseline');
    const other = join(root, 'tests/adoption/pending/templates.json');
    const before =
      '{"unit":"templates","entries":[{"rule":"raw-lucide","file":"templates/blank/src/A.svelte","count":1}]}';
    writeFileSync(other, before);
    writePending(root, checkAdoption({ root, scopes: ['packages/ui'] }).violations, 'prune', [
      'packages/ui',
    ]);
    expect(readFileSync(other, 'utf8')).toBe(before);
  });

  it('prune drops fixed entries and never adds new ones', () => {
    fixture();
    writePending(root, checkAdoption({ root }).violations, 'baseline');
    put(
      'packages/ui/src/Search.svelte',
      '<script lang="ts">import { Badge } from \'texuli/badge\';</script>\n<Badge />'
    );
    put('packages/ui/src/New.svelte', legacy);
    writePending(root, checkAdoption({ root }).violations, 'prune');
    const report = checkAdoption({ root });
    expect(report.problems).toEqual([
      'packages/ui/src/New.svelte: new raw-lucide ×1 (use Texuli, or add a reasoned exception)',
    ]);
  });
});

describe('the Protoyard repository', () => {
  it('has no Texuli adoption violation outside the pending lists (ratchet)', () => {
    const report = checkAdoption();
    expect(report.problems).toEqual([]);
  });
});

describe('Texuli comes from npm', () => {
  it('every manifest pins texuli and @texuli/* to one exact published version, never link: or file:', async () => {
    const { readFileSync, readdirSync, existsSync } = await import('node:fs');
    const root = join(dirname(new URL(import.meta.url).pathname), '../..');
    const manifests = ['package.json'];
    for (const top of ['packages', 'apps', 'templates', 'prototypes']) {
      for (const name of readdirSync(join(root, top))) {
        if (existsSync(join(root, top, name, 'package.json')))
          manifests.push(`${top}/${name}/package.json`);
      }
    }
    const versions = new Set<string>();
    const bad: string[] = [];
    for (const m of manifests) {
      const json = JSON.parse(readFileSync(join(root, m), 'utf8')) as Record<
        string,
        Record<string, string> | undefined
      >;
      for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const [name, spec] of Object.entries(json[section] ?? {})) {
          if (name !== 'texuli' && !name.startsWith('@texuli/')) continue;
          if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(spec)) bad.push(`${m} ${name}@${spec}`);
          else versions.add(spec);
        }
      }
    }
    expect(bad).toEqual([]);
    expect([...versions]).toHaveLength(1);
  });
});
