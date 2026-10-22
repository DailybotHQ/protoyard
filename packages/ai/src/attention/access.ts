/**
 * Who may see and decide on attention items.
 *
 * Access is a view over a prototype's roles. It is simulated UX policy, not
 * real authorization. Map your personas onto admin / member / guest.
 */

import type { AttentionItem } from './types.ts';

export type AttentionAccess = 'admin' | 'member' | 'guest';

export function attentionAccessOf(role: string | null | undefined): AttentionAccess {
  if (!role || role === 'guest' || role === 'billing') return 'guest';
  if (role === 'admin') return 'admin';
  return 'member';
}

export function canSeeAttentionQueue(access: AttentionAccess): boolean {
  return access !== 'guest';
}

export function canDecideAttention(access: AttentionAccess): boolean {
  return access === 'admin';
}

/** The items a person may see. Members see only rows about themselves. */
export function attentionVisibleTo(
  items: AttentionItem[],
  access: AttentionAccess,
  personaId: string
): AttentionItem[] {
  if (access === 'admin') return items;
  if (access === 'guest') return [];
  return items.filter((item) => item.subjectId === personaId);
}
