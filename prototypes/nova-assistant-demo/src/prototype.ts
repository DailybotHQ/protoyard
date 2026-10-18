import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateAssistantWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateAssistantWorld,
  generatorVersion: 1,
  integrity: {
    relations: {
      conversations: { projectId: 'projects' },
      messages: { conversationId: 'conversations' },
    },
    timestamps: {
      projects: ['createdAt'],
      conversations: ['updatedAt'],
      messages: ['createdAt'],
    },
  },
});
