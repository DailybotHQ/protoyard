import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// Static imports: views with components pull in Svelte, bits-ui and the UI kit, which can take
// longer than a test timeout to transform on a busy machine; collection time has no such limit.
import * as cohort from '../src/cohort/index.ts';
import * as dateRange from '../src/date-range/index.ts';
import * as drill from '../src/drill/index.ts';
import * as filters from '../src/filters/index.ts';
import * as funnel from '../src/funnel/index.ts';
import * as grid from '../src/grid/index.ts';
import { ANALYTICS_VIEWS } from '../src/index.ts';

const root = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>;
};

describe('@protoyard/analytics-ui scaffold', () => {
  it('exposes one subpath export per view plus styles', () => {
    // ./player.css: the narrow stylesheet the prebuilt player imports (package-owned scan).
    expect(Object.keys(pkg.exports).sort()).toEqual(
      ['.', './styles.css', './player.css', ...ANALYTICS_VIEWS.map((view) => `./${view}`)].sort()
    );
  });

  it('each view subpath resolves and names its view', () => {
    const modules: Record<string, { VIEW: string }> = {
      'date-range': dateRange,
      drill,
      filters,
      cohort,
      funnel,
      grid,
    };
    expect(Object.keys(modules).sort()).toEqual([...ANALYTICS_VIEWS].sort());
    for (const view of ANALYTICS_VIEWS) expect(modules[view]?.VIEW).toBe(view);
  });

  it('the root entry imports no view, so views stay lazy', () => {
    const source = readFileSync(join(root, 'src/index.ts'), 'utf8');
    for (const view of ANALYTICS_VIEWS) expect(source).not.toContain(`./${view}`);
  });

  it('the stylesheet registers the package with the Tailwind scanner', () => {
    expect(readFileSync(join(root, 'src/styles.css'), 'utf8')).toContain('@source "./"');
  });
});
