import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHART_FAMILIES } from '../src/index.ts';

const root = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, string | { default: string }>;
};

describe('@protoyard/charts-ui scaffold', () => {
  it('exposes one subpath export per chart family plus styles', () => {
    const keys = Object.keys(pkg.exports).sort();
    expect(keys).toEqual(
      ['.', './styles.css', ...CHART_FAMILIES.map((family) => `./${family}`)].sort()
    );
  });

  it('each family subpath resolves and names its family', async () => {
    for (const family of CHART_FAMILIES) {
      const mod = (await import(`../src/${family}/index.ts`)) as { FAMILY: string };
      expect(mod.FAMILY).toBe(family);
    }
  });

  it('the root entry imports no family, so families stay lazy', () => {
    const source = readFileSync(join(root, 'src/index.ts'), 'utf8');
    for (const family of CHART_FAMILIES) {
      expect(source).not.toContain(`./${family}`);
    }
  });

  it('the stylesheet registers the package with the Tailwind scanner', () => {
    expect(readFileSync(join(root, 'src/styles.css'), 'utf8')).toContain('@source "./"');
  });
});
