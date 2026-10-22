// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The blueprint catalog READMEs are the agent-facing index of examples by
 * kind. These checks keep them honest: every relative link and anchor
 * resolves, every example file is linked from its catalog, the counts in the
 * kind table match the folders, and listing claims match the files.
 */
const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const BLUEPRINTS = join(ROOT, 'blueprints');
const KIND_FOLDERS = ['decks', 'pages', 'docs'] as const;
const READMES = ['README.md', ...KIND_FOLDERS.map((folder) => `${folder}/README.md`)].map((file) =>
  join(BLUEPRINTS, file)
);

const read = (file: string) => readFileSync(file, 'utf8');
const jsonFiles = (dir: string) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !/^[._]/.test(name))
    .sort();

/** Markdown links outside fenced code blocks; link text may wrap lines. */
function links(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, '');
  return [...prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => match[1] as string);
}

/** GitHub-style heading anchors of a markdown file. */
function anchors(markdown: string): Set<string> {
  const prose = markdown.replace(/```[\s\S]*?```/g, '');
  const slugs = new Set<string>();
  for (const match of prose.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const slug = (match[1] as string)
      .trim()
      .toLowerCase()
      .replace(/`/g, '')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    slugs.add(slug);
  }
  return slugs;
}

describe('blueprint catalog docs', () => {
  it.each(READMES.map((file) => [relative(ROOT, file), file]))(
    '%s: every relative link and anchor resolves',
    (_name, file) => {
      const markdown = read(file);
      const broken: string[] = [];
      let checked = 0;
      for (const target of links(markdown)) {
        if (/^(?:https?:|mailto:)/i.test(target)) continue;
        checked += 1;
        const [path = '', anchor] = target.split('#');
        const resolved = path ? resolve(dirname(file), path) : file;
        if (!existsSync(resolved)) {
          broken.push(`${target} (missing ${relative(ROOT, resolved)})`);
          continue;
        }
        if (anchor && resolved.endsWith('.md') && statSync(resolved).isFile()) {
          if (!anchors(read(resolved)).has(anchor))
            broken.push(`${target} (no heading #${anchor})`);
        }
      }
      expect(broken).toEqual([]);
      expect(checked).toBeGreaterThan(0);
    }
  );

  it.each(KIND_FOLDERS)('%s/README.md links every example in its folder', (folder) => {
    const markdown = read(join(BLUEPRINTS, folder, 'README.md'));
    const linked = new Set(links(markdown).map((target) => target.replace(/^\.\//, '')));
    const examples = jsonFiles(join(BLUEPRINTS, folder));
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) expect(linked, `${folder}/${example}`).toContain(example);
  });

  it('links each kind catalog and the quick examples from the root index', () => {
    const markdown = read(join(BLUEPRINTS, 'README.md'));
    const targets = links(markdown);
    for (const folder of KIND_FOLDERS) expect(targets).toContain(`./${folder}/README.md`);
    expect(targets).toContain('./quick/README.md');
    expect(targets).toContain('#choose-an-example-by-kind');
  });

  it('keeps the example counts in the kind table equal to the files', () => {
    const markdown = read(join(BLUEPRINTS, 'README.md'));
    const count = (kind: string) => {
      const row = markdown.split('\n').find((line) => line.startsWith(`| \`${kind}\` |`));
      expect(row, kind).toBeDefined();
      return (row as string).split('|')[3]?.trim();
    };
    const apps = jsonFiles(BLUEPRINTS).length;
    const quick = jsonFiles(join(BLUEPRINTS, 'quick')).length;
    expect(count('app')).toBe(`${apps} + ${quick}`);
    expect(count('deck')).toBe(String(jsonFiles(join(BLUEPRINTS, 'decks')).length));
    expect(count('page')).toBe(String(jsonFiles(join(BLUEPRINTS, 'pages')).length));
    expect(count('doc')).toBe(String(jsonFiles(join(BLUEPRINTS, 'docs')).length));
    expect(markdown).toContain(`The catalog contains ${apps} blueprints`);
  });

  it('only says kind examples are unlisted while they lack a catalog block', () => {
    for (const folder of KIND_FOLDERS) {
      const examples = jsonFiles(join(BLUEPRINTS, folder)).map(
        (name) =>
          JSON.parse(read(join(BLUEPRINTS, folder, name))) as { catalog?: unknown; kind?: string }
      );
      for (const example of examples) expect(example.kind).toBe(folder.slice(0, -1));
      const unlisted = examples.every((example) => example.catalog === undefined);
      const markdown = read(join(BLUEPRINTS, folder, 'README.md'));
      expect(markdown.includes('none is listed'), `${folder}/README.md listing claim`).toBe(
        unlisted
      );
    }
  });
});
