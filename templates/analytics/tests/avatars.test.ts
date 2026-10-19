import type { WorldSeed } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { contextFor } from '../../../tests/support/generate-context.ts';
import { definition } from '../src/prototype.ts';

const AVATAR = /^av-\d{3}$/;
const scenarioIds = definition.scenarios.map((s) => s.id);
const worldFor = async (id: string, seed?: number): Promise<WorldSeed> =>
  definition.generate(contextFor(definition.scenarios, id, seed));
const faces = (world: WorldSeed) => world.personas.map((p) => p.avatar);

describe('seeded people have library avatars', () => {
  it('bumps the generator version for the avatar change', () => {
    expect(definition.generatorVersion).toBe(2);
  });

  it('gives every persona a distinct avatar, stable for the same seed', async () => {
    for (const id of scenarioIds) {
      const world = await worldFor(id);
      const ids = faces(world);
      expect(ids.length, id).toBeGreaterThan(0);
      for (const avatar of ids) expect(avatar, id).toMatch(AVATAR);
      // No face repeats until the 175-face library is used up.
      expect(new Set(ids).size, id).toBe(Math.min(ids.length, 175));
      expect(faces(await worldFor(id)), id).toEqual(ids);
    }
  });

  it('deals other faces for another seed', async () => {
    const all = async (seed?: number) =>
      (await Promise.all(scenarioIds.map((id) => worldFor(id, seed)))).flatMap(faces);
    expect(await all(4242)).not.toEqual(await all());
  });
});
