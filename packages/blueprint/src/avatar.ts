import { hashString } from '@protoyard/core';
import { AVATAR_IDS, type AvatarId, isAvatarId } from '@protoyard/scenarios';
import type { BlueprintEntity, BlueprintField } from './schema.ts';

/**
 * Avatar fields: a face from the avatar library stored as its id
 * (`av-001` … `av-175`). Generated rows get seeded faces in the generator;
 * a person changes a face through `EntityService.shuffleAvatar` (a service
 * mutation) or by picking one in the form.
 */

export type AvatarField = Extract<BlueprintField, { kind: 'avatar' }>;

export { AVATAR_IDS, type AvatarId, isAvatarId };

/** The entity's avatar fields, in declaration order. */
export function avatarFields(entity: Pick<BlueprintEntity, 'fields'>): AvatarField[] {
  return entity.fields.filter((field): field is AvatarField => field.kind === 'avatar');
}

/** The face shown next to a record's title: the entity's first avatar field. */
export function primaryAvatarField(
  entity: Pick<BlueprintEntity, 'fields'>
): AvatarField | undefined {
  return avatarFields(entity)[0];
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * The next face after `current` for a stable `key` (for example
 * `customer:<id>:avatar`). Deterministic, with no clock or random source:
 * each key walks the library with its own step, coprime with the library
 * size, so repeated shuffles visit every face once before any repeats and
 * never return `current`. A missing or unknown `current` starts at a
 * key-derived face.
 */
export function nextAvatar(current: unknown, key: string): AvatarId {
  const count = AVATAR_IDS.length;
  const hash = hashString(key);
  let step = 1 + (hash % (count - 1));
  while (gcd(step, count) !== 1) step = (step % (count - 1)) + 1;
  const index = isAvatarId(current) ? AVATAR_IDS.indexOf(current) : -1;
  const next = index < 0 ? hash % count : (index + step) % count;
  return AVATAR_IDS[next] as AvatarId;
}
