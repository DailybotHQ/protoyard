import { isAvatarId } from '@protoyard/avatars';
import { isPersonaAvatar, PersonaSchema, parseScenario } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { createGenerateContext, generateTeam, validateWorld } from '../src/index.ts';

const REF = '2026-06-01T09:00:00.000Z';
const scenario = (seed: number, size = 12) =>
  parseScenario({
    id: 'avatars',
    name: 'Avatars',
    seed,
    referenceTime: REF,
    organization: { ageDays: 90, size, subscription: 'pro' },
  });

describe('generateTeam avatars', () => {
  it('gives every persona a valid, unique library avatar', () => {
    const team = generateTeam(createGenerateContext(scenario(42, 40)));
    expect(team.personas).toHaveLength(40);
    for (const persona of team.personas) {
      expect(isAvatarId(persona.avatar), persona.id).toBe(true);
      expect(isPersonaAvatar(persona.avatar), persona.id).toBe(true);
      expect(PersonaSchema.parse(persona).avatar).toBe(persona.avatar);
    }
    expect(new Set(team.personas.map((p) => p.avatar)).size).toBe(40);
    expect(validateWorld({ ...team, tables: {} }, { referenceTime: REF })).toEqual([]);
  });

  it('is byte-identical for the same seed and differs for another seed', () => {
    const run = (seed: number) =>
      JSON.stringify(generateTeam(createGenerateContext(scenario(seed))));
    expect(run(42)).toBe(run(42));
    const faces = (seed: number) =>
      generateTeam(createGenerateContext(scenario(seed))).personas.map((p) => p.avatar);
    expect(faces(7)).not.toEqual(faces(42));
  });

  it('keeps faces unique up to 175 people and still assigns one to everybody past that', () => {
    const team = generateTeam(createGenerateContext(scenario(3, 180)));
    const faces = team.personas.map((p) => p.avatar);
    expect(new Set(faces.slice(0, 175)).size).toBe(175);
    expect(faces.every(isAvatarId)).toBe(true);
  });

  it('lets the actor override choose a face without shifting the others', () => {
    const plain = generateTeam(createGenerateContext(scenario(42)));
    const custom = generateTeam(createGenerateContext(scenario(42)), {
      actor: { avatar: 'https://cdn.example.com/me.webp' },
    });
    expect(custom.actor.avatar).toBe('https://cdn.example.com/me.webp');
    expect(custom.personas.slice(1)).toEqual(plain.personas.slice(1));
  });
});
