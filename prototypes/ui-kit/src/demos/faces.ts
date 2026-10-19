import { type AvatarImage, avatarImage } from '@protoyard/renderer-svelte';

/**
 * Fixed library faces (`av-NNN`, @protoyard/avatars) for the fictional sample
 * people in the demos, keyed by first name, so the same person has the same
 * face in every demo. No randomness: the ids are written down here.
 */
const FACES: Readonly<Record<string, string>> = {
  Ana: 'av-011',
  Omar: 'av-002',
  Kai: 'av-004',
  Priya: 'av-005',
  Lena: 'av-023',
  Tomás: 'av-016',
  Mia: 'av-007',
  Leo: 'av-019',
  Ivy: 'av-030',
  Noah: 'av-031',
  Jordan: 'av-012',
  Rosa: 'av-021',
};

/** The library avatar id for a sample person, or undefined (initials show). */
export function sampleAvatar(name: string): string | undefined {
  return FACES[name.split(' ')[0] ?? ''];
}

/** `<Avatar>` image props for a sample person: `<Avatar name={n} {...sampleFace(n)} />`. */
export function sampleFace(name: string): AvatarImage {
  return avatarImage(sampleAvatar(name));
}

/** `avatarUrl` / `avatarSrcset` for chat authors and picker users. */
export function sampleImageFields(name: string): { avatarUrl?: string; avatarSrcset?: string } {
  const { src, srcset } = sampleFace(name);
  return { ...(src ? { avatarUrl: src } : {}), ...(srcset ? { avatarSrcset: srcset } : {}) };
}
