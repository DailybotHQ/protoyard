import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateChatWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/** Relay wiring: schema → policy → scenarios → generator. */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  integrity: {
    relations: {
      conversations: { createdBy: 'py_personas' },
      participants: { conversationId: 'conversations' },
      messages: { conversationId: 'conversations' },
      runs: { conversationId: 'conversations', agentId: 'agents', promptMessageId: 'messages' },
    },
    timestamps: { conversations: ['createdAt'], messages: ['at'] },
  },
  generate: generateChatWorld,
});
