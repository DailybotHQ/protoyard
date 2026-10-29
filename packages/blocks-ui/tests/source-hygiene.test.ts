import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../src');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(svelte|ts)$/.test(path) ? [path] : [];
  });
}

const rel = (file: string) => relative(root, file).split('\\').join('/');

describe('blocks-ui source hygiene', () => {
  it('imports no Lucide icon it does not use', () => {
    const unused: string[] = [];
    for (const file of sources(root)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@lucide\/svelte';?/g)) {
        const rest = source.slice(0, match.index) + source.slice(match.index + match[0].length);
        for (const specifier of match[1]?.split(',') ?? []) {
          const local = specifier
            .trim()
            .split(/\s+as\s+/)
            .pop()
            ?.trim();
          if (local && !new RegExp(`\\b${local}\\b`).test(rest))
            unused.push(`${rel(file)}: ${local}`);
        }
      }
    }
    expect(unused).toEqual([]);
  });

  it('only intentional primaries use the default Button variant', () => {
    const found: Record<string, number> = {};
    for (const file of sources(root).filter((path) => path.endsWith('.svelte'))) {
      const source = readFileSync(file, 'utf8');
      let count = 0;
      for (const match of source.matchAll(/<Button\b/g)) {
        let depth = 0;
        let end = match.index + match[0].length;
        for (; end < source.length; end += 1) {
          const char = source[end];
          if (char === '{') depth += 1;
          else if (char === '}') depth -= 1;
          else if (char === '>' && depth === 0) break;
        }
        if (!/\bvariant\b/.test(source.slice(match.index, end))) count += 1;
      }
      if (count) found[rel(file)] = count;
    }
    // Submit actions: the form submit, "Vote" and "Submit answers".
    expect(found).toEqual({
      'interactive/FormBlockView.svelte': 1,
      'interactive/PollBlock.svelte': 1,
      'interactive/QuizBlock.svelte': 1,
    });
  });
});
