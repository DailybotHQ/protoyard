// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProgram } from '../../../packages/cli/src/program.ts';
import { getPublicDocs, renderMarkdown } from '../src/lib/docs/index.ts';
import { EXTRA_GUIDES, FEATURE_AREAS, MEASURED_NUMBERS } from '../src/lib/features.ts';

/**
 * Every claim the home page and /features/ make is held to the repository:
 * each capability links a published guide, every published guide is reachable
 * from them, each number quotes its source guide verbatim under a real
 * heading, and the quick-start commands are real commands and flags.
 */

/** The parts of a commander command these checks read. */
interface Command {
  name(): string;
  commands: readonly Command[];
  options: readonly { long?: string }[];
}

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const FEATURES_PAGE = readFileSync(
  join(REPO, 'apps', 'gallery', 'src', 'pages', 'features.astro'),
  'utf8'
);

/** README's capability map, in order. */
const CAPABILITY_MAP = [
  'quick',
  'player',
  'prototypes',
  'engine',
  'kits',
  'review',
  'share',
  'agents',
  'packages',
];

describe('the feature areas', () => {
  const docs = getPublicDocs();
  const published = new Set(docs.map((doc) => doc.slug));

  it("follow README's capability map, and every one links at least one published guide", () => {
    expect(FEATURE_AREAS.map((area) => area.id)).toEqual(CAPABILITY_MAP);
    for (const area of FEATURE_AREAS) {
      expect(area.guides.length, area.id).toBeGreaterThan(0);
      for (const guide of area.guides)
        expect(published, `${area.id} → ${guide.slug}`).toContain(guide.slug);
    }
  });

  it('reach every published guide between them (with the page’s extra links)', () => {
    const linked = new Set(
      [...FEATURE_AREAS.flatMap((a) => a.guides), ...EXTRA_GUIDES].map((g) => g.slug)
    );
    expect([...published].filter((slug) => !linked.has(slug))).toEqual([]);
  });

  it('say “not on npm yet” wherever packages come up', () => {
    const packages = FEATURE_AREAS.find((area) => area.id === 'packages');
    expect(packages?.summary).toMatch(/Not on npm yet/);
    expect(FEATURES_PAGE).toMatch(/Not on npm yet/);
  });
});

describe('the measured numbers', () => {
  it('quote their source guide verbatim, under a heading that exists', () => {
    expect(MEASURED_NUMBERS.length).toBeGreaterThan(4);
    for (const row of MEASURED_NUMBERS) {
      const text = readFileSync(join(REPO, 'docs', row.doc), 'utf8');
      expect(text, `${row.label}: quote in docs/${row.doc}`).toContain(row.quote);
      const ids = renderMarkdown(text, row.doc).headings.map((h) => h.id);
      expect(ids, `${row.label}: #${row.anchor} in docs/${row.doc}`).toContain(row.anchor);
      // The value shown is the quoted number.
      expect(row.quote, row.label).toContain(row.value.match(/[\d.,]+/)?.[0] ?? row.value);
    }
  });
});

describe('the quick start on /features/', () => {
  const program = createProgram({ setExitCode: () => {} }) as unknown as Command;
  const find = (path: string[]): Command | undefined =>
    path.reduce<Command | undefined>(
      (cmd, name) => cmd?.commands.find((c) => c.name() === name),
      program
    );
  const flags = (cmd: Command | undefined) => new Set(cmd?.options.map((o) => o.long));

  it('uses real commands and flags', () => {
    const quick = find(['quick']);
    expect(flags(quick)).toContain('--slug');
    expect(flags(quick)).toContain('--variants');
    expect(flags(find(['quick', 'serve']))).toContain('--open');
    expect(FEATURES_PAGE).toContain(
      'pnpm protoyard quick "A climbing gym books classes and tracks members" --slug gym --variants 3'
    );
    expect(FEATURES_PAGE).toContain('pnpm protoyard quick serve gym --open');
  });

  it('needs no separate player build, because quick builds the player on first use in the repository', () => {
    const quickBuild = readFileSync(
      join(REPO, 'packages', 'cli', 'src', 'lib', 'quick', 'player-build.ts'),
      'utf8'
    );
    expect(quickBuild).toContain('ensurePlayerAssets');
    expect(FEATURES_PAGE).not.toContain('pnpm --filter @protoyard/player build');
  });
});
