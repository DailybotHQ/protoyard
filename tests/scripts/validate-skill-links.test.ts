import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateSkillLinks } from '../../scripts/validate-skill-links.ts';

const tempRoots: string[] = [];

async function makeSkill(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'protoyard-skill-links-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('validateSkillLinks', () => {
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
