import type {
  ChatAuthor as TexuliChatAuthor,
  ChatMessage as TexuliChatMessage,
} from '@texuli/chat';

export type { ChatMessageStatus, MessageGroup } from '@texuli/chat';

/**
 * Texuli's chat author plus `avatarSrcset`. Texuli's chat renders `avatarUrl`
 * only until its avatars take a `srcset` (Texuli gap G10).
 */
export interface ChatAuthor extends TexuliChatAuthor {
  /** Image URL (for a persona, `avatarImage(persona.avatar).src` from @protoyard/renderer-svelte). */
  avatarUrl?: string;
  /** Optional `srcset` for the image (`avatarImage(persona.avatar).srcset`). */
  avatarSrcset?: string;
}

/** Texuli's chat message (`@texuli/chat`) with Protoyard's author type. */
export interface ChatMessage extends TexuliChatMessage {
  author: ChatAuthor;
}
