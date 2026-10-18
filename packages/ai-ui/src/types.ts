import type { AiMessage, AiModel } from '@protoyard/ai';

export interface AssistantConversation {
  id: string;
  title: string;
  updatedAt: string;
  pinned?: boolean;
  folder?: string;
}

export interface AssistantMessage extends AiMessage {
  feedback?: FeedbackRating;
  branchIndex?: number;
  branchCount?: number;
}

export type FeedbackRating = 'up' | 'down';

export interface AssistantCanvas {
  title: string;
  content: string;
  language?: string;
  kind?: 'code' | 'document';
}

export interface AssistantSendInput {
  prompt: string;
  model: AiModel;
  attachments: readonly File[];
}
