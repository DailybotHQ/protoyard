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
  generatorVersion: 1,
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
