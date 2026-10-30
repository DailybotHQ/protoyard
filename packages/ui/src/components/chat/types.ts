/**
 * Texuli's chat types (`@texuli/chat`). `ChatAuthor` carries `avatarUrl` and
 * `avatarSrcset` (for a persona, `avatarImage(persona.avatar)` from
 * @protoyard/renderer-svelte); `MessageList` passes both to the avatar.
 */
export type {
  ChatAuthor,
  ChatMessage,
  ChatMessageStatus,
  MessageGroup,
} from '@texuli/chat';
