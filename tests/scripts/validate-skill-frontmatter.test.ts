// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  expectedSkillName,
  validateSkillFile,
  validateSkillTree,
} from '../../scripts/validate-skill-frontmatter.ts';

const VALID = [
  '---',
  'name: protoyard-kits',
  'description: Choose kits before writing screens by hand.',
  'version: "1.0.0"',
  'documentation_url: https://protoyard.app/docs/',
  'user-invocable: true',
  'allowed-tools: Bash, Read, Grep, Glob',
  'metadata:',
  '  openclaw:',
  '    emoji: "🧰"',
  '    homepage: https://protoyard.app/docs/ # canonical',
  '    requires:',
  '      anyBins:',
  '        - git',
  '---',
  '',
  '# Kits',
].join('\n');

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'protoyard-skill-frontmatter-'));
  roots.push(root);
  return root;
}

/** Validates `source` as a SKILL.md and returns `field: message` lines. */
function check(source: string, expectedName?: string): string[] {
  const path = join(workspace(), 'SKILL.md');
  writeFileSync(path, source);
  return validateSkillFile(path, 'SKILL.md', expectedName).map((i) => `${i.field}: ${i.message}`);
}

const replace = (from: string, to: string) => {
  expect(VALID).toContain(from);
  return VALID.replace(from, to);
};

describe('validateSkillFile', () => {
  it('accepts a complete frontmatter, comments included', () => {
    expect(check(VALID, 'protoyard-kits')).toEqual([]);
  });

  it.each([
    ['no opening fence', VALID.slice(4), 'frontmatter: frontmatter must start with ---'],
    [
      'no closing fence',
      VALID.replace('---\n\n#', '\n#'),
      'frontmatter: frontmatter must close with ---',
    ],
    [
      'a tab',
      replace('  openclaw:', '\topenclaw:'),
      'frontmatter: frontmatter line 9 contains a tab',
    ],
    [
      'a repeated key',
      replace('user-invocable: true', 'user-invocable: true\nuser-invocable: false'),
      "frontmatter: frontmatter line 7 repeats key 'user-invocable'",
    ],
    [
      'a line without key: value',
      replace('user-invocable: true', 'user-invocable true'),
      'frontmatter: frontmatter line 6 needs key: value',
    ],
    [
      'an unexpected list item',
      replace('user-invocable: true', '- true'),
      'frontmatter: frontmatter line 6 has an unexpected list item',
    ],
  ])('rejects malformed YAML: %s', (_label, source, expected) => {
    expect(check(source)).toEqual([expected]);
  });

  it.each([
    [
      'a missing name',
      replace('name: protoyard-kits\n', ''),
      'name: is required and must be a string',
    ],
    [
      'a name outside the namespace',
      replace('name: protoyard-kits', 'name: kits'),
      "name: must be namespaced kebab-case beginning with protoyard (got 'kits')",
    ],
    [
      'an empty description',
      replace('description: Choose kits before writing screens by hand.', 'description: ""'),
      'description: is required and must be non-empty text',
    ],
    [
      'a missing version',
      replace('version: "1.0.0"\n', ''),
      'version: is required and must be a quoted SemVer string',
    ],
    [
      'an unquoted version',
      replace('version: "1.0.0"', 'version: 1.0.0'),
      'version: must be quoted (for example version: "1.0.0")',
    ],
    [
      'a version that is not SemVer',
      replace('version: "1.0.0"', 'version: "1.0"'),
      "version: must be SemVer-shaped X.Y.Z (got '1.0')",
    ],
    [
      'a homepage key',
      replace('user-invocable: true', 'user-invocable: true\nhomepage: https://protoyard.app/'),
      'homepage: is forbidden; use documentation_url instead',
    ],
    [
      'another documentation URL',
      replace(
        'documentation_url: https://protoyard.app/docs/',
        'documentation_url: https://example.com/docs/'
      ),
      'documentation_url: must be https://protoyard.app/docs/',
    ],
    [
      'a quoted user-invocable',
      replace('user-invocable: true', 'user-invocable: "true"'),
      'user-invocable: is required and must be the YAML boolean true or false',
    ],
    [
      'no allowed tools',
      replace('allowed-tools: Bash, Read, Grep, Glob\n', ''),
      'allowed-tools: is required and must be a non-empty comma-separated list',
    ],
    [
      'an unsupported tool',
      replace('Bash, Read, Grep, Glob', 'Bash, WebFetch'),
      "allowed-tools: contains unsupported tool 'WebFetch'",
    ],
    [
      'an empty emoji',
      replace('emoji: "🧰"', 'emoji: ""'),
      'metadata.openclaw.emoji: is required and must be non-empty text',
    ],
    [
      'another OpenClaw homepage',
      replace(
        'homepage: https://protoyard.app/docs/ # canonical',
        'homepage: https://example.com/'
      ),
      'metadata.openclaw.homepage: must be https://protoyard.app/docs/',
    ],
    [
      'an empty anyBins',
      replace('      anyBins:\n        - git', '      anyBins: []'),
      'metadata.openclaw.requires.anyBins: is required and must be a non-empty list of binary names',
    ],
  ])('rejects %s', (_label, source, expected) => {
    expect(check(source)).toEqual([expected]);
  });

  it('rejects a missing OpenClaw mapping', () => {
    const source = VALID.replace(/metadata:\n[\s\S]*?\n---/, '---');
    expect(check(source)).toEqual(['metadata.openclaw: is required and must be a mapping']);
  });

  it('rejects a name that does not match its folder', () => {
    expect(check(VALID, 'protoyard-quick')).toEqual([
      "name: must be 'protoyard-quick' to match its folder (got 'protoyard-kits')",
    ]);
  });
});

describe('expectedSkillName', () => {
  it('is protoyard for the router and protoyard-<folder> for a sub-skill', () => {
    const root = join('repo', 'skills', 'protoyard');
    expect(expectedSkillName(root, join(root, 'SKILL.md'))).toBe('protoyard');
    expect(expectedSkillName(root, join(root, 'kits', 'SKILL.md'))).toBe('protoyard-kits');
  });
});

describe('validateSkillTree', () => {
  it('validates every SKILL.md under skills/protoyard with its folder name', () => {
    const root = workspace();
    const skills = join(root, 'skills', 'protoyard');
    mkdirSync(join(skills, 'kits'), { recursive: true });
    mkdirSync(join(skills, 'quick'), { recursive: true });
    writeFileSync(
      join(skills, 'SKILL.md'),
      VALID.replace('name: protoyard-kits', 'name: protoyard')
    );
    writeFileSync(join(skills, 'kits', 'SKILL.md'), VALID);
    writeFileSync(join(skills, 'quick', 'SKILL.md'), VALID);
    writeFileSync(join(skills, 'quick', 'notes.md'), 'not a skill');
    expect(validateSkillTree(root)).toEqual([
      {
        file: join('skills', 'protoyard', 'quick', 'SKILL.md'),
        field: 'name',
        message: "must be 'protoyard-quick' to match its folder (got 'protoyard-kits')",
      },
    ]);
  });

  it('reports a missing skill directory', () => {
    expect(validateSkillTree(workspace())).toEqual([
      { file: 'skills/protoyard', field: 'tree', message: 'skill directory does not exist' },
    ]);
  });

  it('passes on this repository’s skill', () => {
    expect(validateSkillTree()).toEqual([]);
  });
});
