import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/** Type aliases keep rows assignable to the generic `Row`. */

export type Conversation = {
  id: string;
  title: string;
  createdBy: string;
  createdAt: string;
  lastMessageAt: string;
  handoffRequested: boolean;
  handoffJoined: boolean;
};

export type MessageStatus = 'sent' | 'streaming' | 'failed' | 'stopped';

export type Message = {
  id: string;
  conversationId: string;
  authorId: string;
  authorKind: 'person' | 'assistant';
  body: string;
  at: string;
  status: MessageStatus;
  promptId: string | null;
  error: string | null;
};

export type ReadMarker = {
  id: string;
  conversationId: string;
  personaId: string;
  lastReadAt: string;
};

/** Fictional store order — money is integer cents. */
export type OrderStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled';

export type Order = {
  id: string;
  /** Human-facing order number, e.g. NW-10042. */
  number: string;
  email: string;
  status: OrderStatus;
  /** Integer cents. */
  totalCents: number;
  itemSummary: string;
  orderedAt: string;
  shippedAt: string | null;
  trackingCode: string | null;
};

export type ReturnStatus = 'requested' | 'approved' | 'received' | 'refunded' | 'denied';

export type ReturnRequest = {
  id: string;
  orderId: string;
  reason: string;
  status: ReturnStatus;
  /** Integer cents requested back. */
  amountCents: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type ChatDatabase = Dexie & {
  conversations: EntityTable<Conversation, 'id'>;
  messages: EntityTable<Message, 'id'>;
  reads: EntityTable<ReadMarker, 'id'>;
  orders: EntityTable<Order, 'id'>;
  returns: EntityTable<ReturnRequest, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        conversations: 'id, createdBy, lastMessageAt',
        messages: 'id, conversationId, [conversationId+at], authorId, status',
        reads: 'id, conversationId, personaId',
        orders: 'id, number, email, status, orderedAt',
        returns: 'id, orderId, status, createdAt',
      },
    },
  ],
};

export const readMarkerId = (conversationId: string, personaId: string) =>
  `${conversationId}:${personaId}`;

export const SUPPORT_THREAD_ID = 'conv_support';
