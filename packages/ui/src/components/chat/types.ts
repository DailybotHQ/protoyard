import type { DateInput } from '../../lib/date.ts';

export type ChatMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface ChatAuthor {
  id: string;
  name: string;
  /** Image URL (for a persona, `avatarImage(persona.avatar).src` from @protoyard/renderer-svelte). */
  avatarUrl?: string;
  /** Optional `srcset` for the image (`avatarImage(persona.avatar).srcset`). */
  avatarSrcset?: string;
}

export interface ChatMessage {
  id: string;
  author: ChatAuthor;
  body: string;
  at: DateInput;
  status?: ChatMessageStatus;
}
