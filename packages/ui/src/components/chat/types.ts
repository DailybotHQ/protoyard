import type { DateInput } from '../../lib/date.ts';

export type ChatMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface ChatAuthor {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface ChatMessage {
  id: string;
  author: ChatAuthor;
  body: string;
  at: DateInput;
  status?: ChatMessageStatus;
}
