import { describe, expect, it } from 'vitest';
import { AVATAR_IDS } from '../../avatars/src/index.ts';
import {
  isPersonaAvatar,
  PERSONA_AVATAR_ID_PATTERN,
  PERSONA_AVATAR_MAX_LENGTH,
  type Persona,
  PersonaAvatarSchema,
  PersonaSchema,
} from '../src/index.ts';

const base = { id: 'user_0001', name: 'Robin Vega', joinedAt: '2026-01-01T00:00:00.000Z' };

const ACCEPTED = [
  'av-001',
  'av-175',
  'https://images.example.com/people/robin.webp',
  'https://cdn.example.com:8443/a/b.png?size=128#x',
  '/avatars/av-007.webp',
  '/',
];

const REJECTED = [
  '',
  'av-1',
  'av-0001',
  'AV-001',
  'avatar-001',
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'data:image/png;base64,AAAA',
  'http://images.example.com/robin.webp',
  '//evil.example.com/robin.webp',
  '/\\evil.example.com/robin.webp',
  'https://user:secret@images.example.com/robin.webp',
  'https://',
  'https://images.example.com/robin webp',
  ' /avatars/robin.webp',
  'avatars/robin.webp',
  `/${'a'.repeat(PERSONA_AVATAR_MAX_LENGTH)}`,
];

describe('persona avatar contract', () => {
  it('keeps an optional avatar and leaves existing personas valid', () => {
    const legacy = PersonaSchema.parse({ ...base, avatarColor: '#336699' });
    expect(legacy.avatar).toBeUndefined();
    expect(legacy.avatarColor).toBe('#336699');
    expect('avatar' in legacy).toBe(false);

    const withAvatar = PersonaSchema.parse({ ...base, avatarColor: '#336699', avatar: 'av-042' });
    expect(withAvatar).toMatchObject({ avatar: 'av-042', avatarColor: '#336699' });
    const typed: Persona['avatar'] = withAvatar.avatar;
    expect(typed).toBe('av-042');
  });

  it.each(ACCEPTED)('accepts %s', (avatar) => {
    expect(PersonaAvatarSchema.safeParse(avatar).success).toBe(true);
    expect(PersonaSchema.safeParse({ ...base, avatar }).success).toBe(true);
    expect(isPersonaAvatar(avatar)).toBe(true);
  });

  it.each(REJECTED)('rejects %s', (avatar) => {
    expect(PersonaAvatarSchema.safeParse(avatar).success).toBe(false);
    const result = PersonaSchema.safeParse({ ...base, avatar });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['avatar']);
    expect(isPersonaAvatar(avatar)).toBe(false);
  });

  it('rejects non-string avatars and long https URLs', () => {
    for (const avatar of [null, 7, {}, ['av-001']]) {
      expect(PersonaSchema.safeParse({ ...base, avatar }).success).toBe(false);
      expect(isPersonaAvatar(avatar)).toBe(false);
    }
    const prefix = 'https://images.example.com/';
    const atLimit = prefix + 'a'.repeat(PERSONA_AVATAR_MAX_LENGTH - prefix.length);
    expect(atLimit).toHaveLength(PERSONA_AVATAR_MAX_LENGTH);
    expect(isPersonaAvatar(atLimit)).toBe(true);
    expect(isPersonaAvatar(`${atLimit}a`)).toBe(false);
  });

  it('matches every id in the @protoyard/avatars library', () => {
    expect(AVATAR_IDS.length).toBeGreaterThan(0);
    for (const id of AVATAR_IDS) {
      expect(id).toMatch(PERSONA_AVATAR_ID_PATTERN);
      expect(isPersonaAvatar(id)).toBe(true);
    }
  });
});
