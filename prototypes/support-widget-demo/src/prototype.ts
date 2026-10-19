import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateChatWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateChatWorld,
  /** v2: personas carry library avatars (`av-NNN`), shown as photos. */
  generatorVersion: 2,
  integrity: {
    relations: {
      conversations: { createdBy: 'py_personas' },
      messages: { conversationId: 'conversations' },
      reads: { conversationId: 'conversations', personaId: 'py_personas' },
      returns: { orderId: 'orders', createdBy: 'py_personas' },
    },
    timestamps: {
      conversations: ['createdAt'],
      messages: ['at'],
      orders: ['orderedAt'],
      returns: ['createdAt'],
    },
  },
});
