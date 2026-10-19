import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_VIEWS } from '../src/index.ts';

const root = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>;
};

describe('@protoyard/analytics-ui scaffold', () => {
  it('exposes one subpath export per view plus styles', () => {
    expect(Object.keys(pkg.exports).sort()).toEqual(
      ['.', './styles.css', ...ANALYTICS_VIEWS.map((view) => `./${view}`)].sort()
    );
  });

  it('each view subpath resolves and names its view', async () => {
    for (const view of ANALYTICS_VIEWS) {
      const mod = (await import(`../src/${view}/index.ts`)) as { VIEW: string };
      expect(mod.VIEW).toBe(view);
    }
  });

  it('the root entry imports no view, so views stay lazy', () => {
    const source = readFileSync(join(root, 'src/index.ts'), 'utf8');
    for (const view of ANALYTICS_VIEWS) expect(source).not.toContain(`./${view}`);
  });

  it('the stylesheet registers the package with the Tailwind scanner', () => {
    expect(readFileSync(join(root, 'src/styles.css'), 'utf8')).toContain('@source "./"');
  });
});
