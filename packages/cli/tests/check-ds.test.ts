// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyUtility,
  DS_RULES,
  type DsViolation,
  scanDesignSystemSource,
} from '../src/lib/ds-check/index.ts';
import { RULES, scanSource } from '../src/lib/texuli-adoption.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/ds-check/', import.meta.url));
const WAY_OUT = 'Use a design-system component, or request one: protoyard ds component request';
const LOCKED = { designSystem: { id: 'harbor', version: '1.2.0', locked: true } };

const fixture = (kind: 'fail' | 'pass', name: string) =>
  readFileSync(join(FIXTURES, kind, name), 'utf8');
const rulesOf = (violations: DsViolation[]) => [...new Set(violations.map((v) => v.rule))];

type Envelope = {
  ok: boolean;
  data: {
    ok: boolean;
    report: boolean;
    counts: { prototypes: number; violations: number; byRule: Record<string, number> };
    prototypes: { slug: string; locked: boolean }[];
    violations: (DsViolation & { slug: string; locked: boolean })[];
  };
  error?: { code: string; message: string; hint?: string };
};

describe('ds-check rules (fixtures)', () => {
  const failing = readdirSync(join(FIXTURES, 'fail')).sort();

  it('has one failing fixture and a passing twin for every rule', () => {
    const covered = new Set(failing.map((f) => f.replace(/\.(svelte|css)$/, '')));
    expect([...covered].sort()).toEqual([...DS_RULES].sort());
    expect(readdirSync(join(FIXTURES, 'pass')).sort()).toEqual(failing);
  });

  for (const name of failing) {
    const rule = name.replace(/\.(svelte|css)$/, '');
    it(`${name}: fails with ${rule}, and its twin passes`, () => {
      const found = scanDesignSystemSource(`src/${name}`, fixture('fail', name), {
        designSystemId: 'harbor',
      });
      expect(rulesOf(found)).toContain(rule);
      for (const v of found) {
        expect(v.file).toBe(`src/${name}`);
        expect(v.line).toBeGreaterThan(0);
        expect(v.message.length).toBeGreaterThan(0);
        expect(v.wayOut).toContain(`${WAY_OUT} harbor `);
      }
      expect(scanDesignSystemSource(`src/${name}`, fixture('pass', name))).toEqual([]);
    });
  }

  it('reports the line of each violation and ignores commented-out code', () => {
    const source = [
      '<script lang="ts">',
      '/* a comment',
      '   over lines */',
      "import { Button } from 'texuli/button';",
      '</script>',
      '',
      '<!-- <button>old</button>',
      '-->',
      '<button>new</button>',
    ].join('\n');
    const found = scanDesignSystemSource('src/A.svelte', source);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'ds-raw-control', line: 9 });
    expect(found[0]?.wayOut).toBe(`${WAY_OUT} <design-system-id> Button`);
  });

  it('refuses arbitrary values even on allowed utilities, and allows responsive layout', () => {
    expect(classifyUtility('p-[13px]')).toBe('arbitrary');
    expect(classifyUtility('md:grid-cols-[1fr_2fr]')).toBe('arbitrary');
    expect(classifyUtility('gap-(--my-gap)')).toBe('arbitrary');
    for (const ok of ['md:grid-cols-2', 'lg:flex-row', 'hover:p-2', '-mt-2', 'w-1/2', 'sr-only'])
      expect(classifyUtility(ok), ok).toBe('allowed');
    for (const visual of ['bg-slate-100', 'text-sm', 'rounded-lg', 'shadow-md', 'md:font-bold'])
      expect(classifyUtility(visual), visual).toBe('visual');
    expect(classifyUtility('container')).toBe('unknown');
    expect(classifyUtility('z-[60]')).toBe('arbitrary');
    expect(classifyUtility('z-999')).toBe('unknown');

    const arbitrary = scanDesignSystemSource('src/A.svelte', '<div class="p-[13px]"></div>');
    expect(arbitrary.map((v) => v.rule)).toEqual(['ds-utility']);
    expect(arbitrary[0]?.message).toContain('p-[13px]');
    expect(
      scanDesignSystemSource('src/A.svelte', '<div class="grid md:grid-cols-2"></div>')
    ).toEqual([]);
  });

  it('allows text flow, box and Protoyard layout tokens, never typography or color', () => {
    for (const ok of [
      'text-center',
      'md:text-right',
      'truncate',
      'line-clamp-2',
      'break-words',
      'whitespace-pre-wrap',
      'pointer-events-none',
      'aspect-video',
      'object-cover',
      'pt-safe',
      'pb-safe',
      'min-h-touch',
      'invisible',
    ]) {
      expect(classifyUtility(ok), ok).toBe('allowed');
    }
    for (const bad of [
      'text-sm',
      'text-muted-foreground',
      'font-medium',
      'leading-tight',
      'tracking-tight',
      'uppercase',
      'italic',
    ]) {
      expect(classifyUtility(bad), bad).toBe('visual');
    }
  });

  it('reads class directives, class expressions and cx() strings', () => {
    const source = [
      '<script lang="ts">',
      "import { cx } from 'texuli/cx';",
      "let { tone = 'calm' } = $props();",
      "const box = cx('flex gap-2', tone === 'loud' && 'text-red-600');",
      '</script>',
      '',
      '<div class={box} class:hidden={false} class:ring-2={true}></div>',
      "<div class={tone === 'calm' ? 'p-2' : 'bg-red-50'}></div>",
    ].join('\n');
    const found = scanDesignSystemSource('src/A.svelte', source);
    expect(found.filter((v) => v.rule === 'ds-utility').map((v) => [v.line, v.message])).toEqual([
      [4, 'class "text-red-600" is a visual utility (locked mode allows layout utilities only)'],
      [7, 'class "ring-2" is a visual utility (locked mode allows layout utilities only)'],
      [8, 'class "bg-red-50" is a visual utility (locked mode allows layout utilities only)'],
    ]);
  });

  it('accepts tx- classes and classes the prototype defines with layout CSS', () => {
    const source = '<div class="tx-stack board-grid"></div>';
    expect(rulesOf(scanDesignSystemSource('src/A.svelte', source))).toEqual(['ds-utility']);
    expect(
      scanDesignSystemSource('src/A.svelte', source, { localClasses: new Set(['board-grid']) })
    ).toEqual([]);
  });

  it('flags tx- targets and token redefinitions in a global stylesheet', () => {
    const css =
      ':root {\n  --tx-color-primary: #ff0000;\n}\n[data-tx-ds] .tx-card {\n  gap: 0;\n}\n';
    const found = scanDesignSystemSource('src/app.css', css);
    expect(found.map((v) => [v.rule, v.line])).toEqual([
      ['ds-visual-css', 2],
      ['ds-global-override', 4],
    ]);
  });

  it('leaves the Texuli adoption rules unchanged', () => {
    expect(RULES).toHaveLength(10);
    const found = scanSource(
      'prototypes/x/src/A.svelte',
      '<!-- <button>x</button> -->\n<button>a</button><input />'
    );
    expect(found).toEqual([{ file: 'prototypes/x/src/A.svelte', rule: 'raw-control', count: 2 }]);
  });
});

describe('protoyard check ds', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  const run = async (...args: string[]) => {
    const result = await cli([
      '--root',
      (ws as TempWorkspace).root,
      '--json',
      'check',
      'ds',
      ...args,
    ]);
    return { code: result.code, body: result.json<Envelope>() };
  };

  const setup = () => {
    ws = createWorkspace();
    addPrototype(ws, 'locked-app', LOCKED);
    ws.write('prototypes/locked-app/src/App.svelte', fixture('fail', 'ds-raw-control.svelte'));
    addPrototype(ws, 'loose-app');
    ws.write('prototypes/loose-app/src/App.svelte', fixture('fail', 'ds-utility.svelte'));
    return ws;
  };

  it('fails a locked prototype end to end, naming rule, file and the way out', async () => {
    setup();
    const { code, body } = await run();
    expect(code).toBe(4);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe('validation');
    expect(body.error?.hint).toContain('ds-raw-control prototypes/locked-app/src/App.svelte:');
    expect(body.error?.hint).toContain(`${WAY_OUT} harbor Button`);
    expect(body.data.ok).toBe(false);
    // Without slugs only locked prototypes are checked.
    expect(body.data.prototypes.map((p) => p.slug)).toEqual(['locked-app']);
    expect(body.data.counts.byRule['ds-raw-control']).toBe(1);
    expect(body.data.violations[0]).toMatchObject({
      rule: 'ds-raw-control',
      file: 'prototypes/locked-app/src/App.svelte',
      line: 6,
      slug: 'locked-app',
    });
  });

  it('passes a clean locked prototype and skips tests, generated code and node_modules', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'locked-app', LOCKED);
    ws.write('prototypes/locked-app/src/App.svelte', fixture('pass', 'ds-raw-control.svelte'));
    ws.write('prototypes/locked-app/src/app.css', fixture('pass', 'ds-visual-css.css'));
    const dirty = fixture('fail', 'ds-raw-control.svelte');
    ws.write('prototypes/locked-app/src/generated/Screen.svelte', dirty);
    ws.write('prototypes/locked-app/src/tests/Fixture.svelte', dirty);
    ws.write('prototypes/locked-app/node_modules/pkg/A.svelte', dirty);
    ws.write('prototypes/locked-app/tests/A.svelte', dirty);
    const { code, body } = await run();
    expect(code).toBe(0);
    expect(body.data).toMatchObject({ ok: true, counts: { prototypes: 1, violations: 0 } });
  });

  it('report mode exits 0, includes unlocked prototypes and lists their violations', async () => {
    setup();
    const { code, body } = await run('--report');
    expect(code).toBe(0);
    expect(body.ok).toBe(true);
    expect(body.data.report).toBe(true);
    expect(body.data.prototypes.map((p) => [p.slug, p.locked]).sort()).toEqual([
      ['locked-app', true],
      ['loose-app', false],
    ]);
    const loose = body.data.violations.filter((v) => v.slug === 'loose-app');
    expect(loose.map((v) => v.rule)).toEqual(['ds-utility', 'ds-utility']);
    expect(loose[0]?.wayOut).toBe(`${WAY_OUT} <design-system-id> <Name>`);

    const named = await run('loose-app', '--report');
    expect(named.code).toBe(0);
    expect(named.body.data.prototypes.map((p) => p.slug)).toEqual(['loose-app']);
  });

  it('refuses a named unlocked prototype without --report, and unsafe slugs', async () => {
    setup();
    const unlocked = await run('loose-app');
    expect(unlocked.code).toBe(2);
    expect(unlocked.body.error?.code).toBe('usage');
    expect(unlocked.body.error?.message).toContain('not locked');
    expect(unlocked.body.error?.hint).toContain('--report');

    const unsafe = await run('../locked-app');
    expect(unsafe.code).toBe(2);
    expect(unsafe.body.ok).toBe(false);
  });

  it('validate fails a locked prototype on violations and leaves unlocked ones alone', async () => {
    setup();
    const root = (ws as TempWorkspace).root;
    type Validation = { data: { checks: { id: string; status: string; details: string[] }[] } };
    const locked = await cli([
      '--root',
      root,
      '--json',
      'validate',
      'locked-app',
      '--skip-typecheck',
    ]);
    const step = locked.json<Validation>().data.checks.find((c) => c.id === 'design-system');
    expect(step?.status).toBe('fail');
    expect(step?.details.join('\n')).toContain(
      'ds-raw-control prototypes/locked-app/src/App.svelte:6'
    );
    expect(step?.details.join('\n')).toContain(`${WAY_OUT} harbor Button`);

    const loose = await cli([
      '--root',
      root,
      '--json',
      'validate',
      'loose-app',
      '--skip-typecheck',
    ]);
    expect(loose.json<Validation>().data.checks.some((c) => c.id === 'design-system')).toBe(false);
  });
});
