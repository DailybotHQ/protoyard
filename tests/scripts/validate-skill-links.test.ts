import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findMarkdownLinks, validateSkillLinks } from '../../scripts/validate-skill-links.ts';

const tempRoots: string[] = [];

async function makeSkill(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'protoyard-skill-links-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('findMarkdownLinks', () => {
  it('finds inline and reference destinations, but ignores code examples', () => {
    expect(
      findMarkdownLinks(
        '[inline](guide.md)\n[reference]: <ref.md>\n`[code](ignored.md)`\n```md\n[fenced](ignored.md)\n```'
      )
    ).toEqual([
      { destination: 'guide.md', line: 1 },
      { destination: 'ref.md', line: 2 },
    ]);
  });
});

describe('validateSkillLinks', () => {
  it('accepts existing relative links and documented external links without fetching them', async () => {
    const root = await makeSkill();
    await writeFile(
      join(root, 'SKILL.md'),
      '[guide](guides/start.md#install) and [web](https://example.com/guide)'
    );
    await mkdir(join(root, 'guides'));
    await writeFile(join(root, 'guides/start.md'), '# Start');

    await expect(validateSkillLinks(root)).resolves.toEqual([]);
  });

  it('reports a missing target with the source line', async () => {
    const root = await makeSkill();
    await writeFile(join(root, 'SKILL.md'), '# Skill\n\n[missing](absent.md)');

    await expect(validateSkillLinks(root)).resolves.toEqual([
      { source: 'SKILL.md', line: 3, destination: 'absent.md', reason: 'target does not exist' },
    ]);
  });

  it('rejects paths that escape the skill pack', async () => {
    const root = await makeSkill();
    await writeFile(join(root, 'SKILL.md'), '[outside](../../outside.md)');

    await expect(validateSkillLinks(root)).resolves.toEqual([
      {
        source: 'SKILL.md',
        line: 1,
        destination: '../../outside.md',
        reason: 'resolves outside skills/protoyard',
      },
    ]);
  });

  it('rejects symlinks that resolve outside the skill pack', async () => {
    const root = await makeSkill();
    const outside = await makeSkill();
    await writeFile(join(root, 'SKILL.md'), '[linked](outside.md)');
    await writeFile(join(outside, 'secret.md'), '# Outside');
    await symlink(join(outside, 'secret.md'), join(root, 'outside.md'));

    await expect(validateSkillLinks(root)).resolves.toEqual([
      {
        source: 'SKILL.md',
        line: 1,
        destination: 'outside.md',
        reason: 'follows a symlink outside skills/protoyard',
      },
    ]);
  });
});
