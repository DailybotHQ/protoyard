import type { WorldSeed } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { contextFor } from '../../../tests/support/generate-context.ts';
import type { TrackedUser } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';

const AVATAR = /^av-\d{3}$/;
const scenarioIds = definition.scenarios.map((s) => s.id);
const worldFor = (id: string, seed?: number): WorldSeed =>
  definition.generate(contextFor(definition.scenarios, id, seed)) as WorldSeed;
const users = (world: WorldSeed) => (world.tables.users ?? []) as unknown as TrackedUser[];
const faces = (world: WorldSeed) => ({
  team: world.personas.map((p) => p.avatar),
  users: users(world).map((u) => u.avatar),
});

describe('seeded people have library avatars', () => {
  it('bumps the generator version for the avatar change', () => {
    expect(definition.generatorVersion).toBe(2);
  });

  it('gives every persona and tracked user an avatar, stable for the same seed', () => {
    let tracked = 0;
    for (const id of scenarioIds) {
      const world = worldFor(id);
      const { team, users: userFaces } = faces(world);
      expect(team.length, id).toBeGreaterThan(0);
      for (const avatar of [...team, ...userFaces]) expect(avatar, id).toMatch(AVATAR);
      // Team faces are distinct, and users skip them until the library runs out.
      expect(new Set(team).size, id).toBe(team.length);
      const firstUsers = userFaces.slice(0, 175 - team.length);
      expect(
        firstUsers.some((a) => team.includes(a)),
        id
      ).toBe(false);
      expect(new Set(firstUsers).size, id).toBe(firstUsers.length);
      expect(faces(worldFor(id)), id).toEqual(faces(world));
      tracked += userFaces.length;
    }
    expect(tracked).toBeGreaterThan(0);
  });

  it('deals other faces for another seed', () => {
    expect(faces(worldFor('healthy-growth', 77))).not.toEqual(faces(worldFor('healthy-growth')));
  });
});
