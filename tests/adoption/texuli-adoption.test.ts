// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAdoption, scanSource, writePending } from '../../scripts/check-texuli-adoption.ts';

const rules = (file: string, source: string) =>
  Object.fromEntries(scanSource(file, source).map((v) => [v.rule, v.count]));

describe('scanSource', () => {
  it('flags local motion in UI units: svelte/transition, svelte/animate and @keyframes', () => {
    const svelte = `<script lang="ts">import { fade } from 'svelte/transition';\nimport { flip } from 'svelte/animate';</script>\n<div transition:fade>x</div>\n<style>@keyframes spin { to { rotate: 1turn; } }</style>`;
    expect(rules('packages/ui/src/A.svelte', svelte)['local-motion']).toBe(3);
    expect(
      rules('templates/x/src/app.css', '@keyframes pulse { 50% { opacity: .5; } }')['local-motion']
    ).toBe(1);
    expect(
      rules(
        'prototypes/x/src/A.svelte',
        `<script>import { fly } from "svelte/transition";</script>`
      )['local-motion']
    ).toBe(1);
  });

  it('flags a pixel number as an icon size and not a Texuli size', () => {
    const bad = `<Icon icon="search" size={16} class="absolute" />\n<LucideIcon icon={X} size="14" />`;
    expect(rules('apps/gallery/src/A.svelte', bad)['icon-size']).toBe(2);
    const good = `<Icon icon="search" size="sm" />\n<LucideIcon icon={X} size={big ? 'md' : 'sm'} />\n<Avatar size={32} />`;
    expect(rules('apps/gallery/src/A.svelte', good)['icon-size']).toBeUndefined();
  });

  it('flags a scoped rule for a class passed only to a component (Dailybot G-060)', () => {
    const bad = `<script>import { Button } from 'texuli/button';</script>
<Button class="save">Save</Button>
<p class="note">Saved</p>
<style>
  .save { color: red; }
  .note { color: gray; }
</style>`;
    expect(rules('prototypes/x/src/A.svelte', bad)['component-scoped-class']).toBe(1);
    const good = `<script>import { Button } from 'texuli/button';
const tone = 'live';</script>
<div class="bar"><Button class="save">Save</Button><Button class="live">Go</Button></div>
<span class:open={true}></span><Badge class="open" />
<style>
  .bar :global(.save) { color: red; }
  .live, .open { color: green; }
  :global(.solo) { color: blue; }
</style>`;
    expect(rules('prototypes/x/src/A.svelte', good)['component-scoped-class']).toBeUndefined();
  });

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

  it('flags var(--py-*) reads and not --tx-* reads', () => {
    expect(
      rules('packages/x/src/a.css', '.a { color: var(--py-fg); background: var( --py-bg ); }')[
        'py-token'
      ]
    ).toBe(2);
    expect(rules('packages/x/src/a.css', '.a { color: var(--tx-fg); }')).toEqual({});
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

  it('fails on a stale pending entry until --prune tightens it', () => {
    fixture();
    writePending(root, checkAdoption({ root }).violations, 'baseline');
    put(
      'packages/ui/src/Search.svelte',
      '<script lang="ts">import { Badge } from \'texuli/badge\';</script>\n<Badge />'
    );
    expect(checkAdoption({ root }).problems).toEqual([
      'packages/ui/src/Search.svelte: raw-lucide pending ×1 is stale (now ×0); run --prune to tighten it',
    ]);
    // Out of scope, the stale entry is not this run's business.
    expect(checkAdoption({ root, scopes: ['templates'] }).ok).toBe(true);
    writePending(root, checkAdoption({ root }).violations, 'prune');
    expect(checkAdoption({ root }).ok).toBe(true);
  });
});

describe('the Protoyard repository', () => {
  it('has no Texuli adoption violation outside the pending lists (ratchet)', () => {
    const report = checkAdoption();
    expect(report.problems).toEqual([]);
  });
});

describe('Texuli comes from npm', () => {
  it('every manifest pins texuli and @texuli/* exactly, the same version of a package everywhere, never link: or file:', async () => {
    const { readFileSync, readdirSync, existsSync } = await import('node:fs');
    const root = join(dirname(new URL(import.meta.url).pathname), '../..');
    const manifests = ['package.json'];
    for (const top of ['packages', 'apps', 'templates', 'prototypes']) {
      for (const name of readdirSync(join(root, top))) {
        if (existsSync(join(root, top, name, 'package.json')))
          manifests.push(`${top}/${name}/package.json`);
      }
    }
    const versions = new Map<string, Set<string>>();
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
          else versions.set(name, (versions.get(name) ?? new Set()).add(spec));
        }
      }
    }
    expect(bad).toEqual([]);
    const split = [...versions].filter(([, v]) => v.size > 1).map(([n, v]) => `${n}: ${[...v]}`);
    expect(split).toEqual([]);
    expect(versions.size).toBeGreaterThan(10);
  });
});
