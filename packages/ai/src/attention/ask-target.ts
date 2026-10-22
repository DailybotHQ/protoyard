/**
 * The person a morale (or similar) item asks: never the one deciding.
 */

import type { AttentionItem } from './types.ts';

export function askTarget(
  action: Extract<AttentionItem['action'], { type: 'ask_person' }>,
  deciderPersonaId: string | null
): string {
  return action.personaId === deciderPersonaId ? action.fallbackPersonaId : action.personaId;
}
