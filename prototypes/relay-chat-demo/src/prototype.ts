import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import { generateTeamChatWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';
import { applyTeamChatEvent, teamChatTimeline } from './scenarios/timeline.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateTeamChatWorld,
  /** v3: personas carry library avatars (`generateTeam`), shown as photos. */
  generatorVersion: 3,
  integrity: {
    relations: {
      channels: { workspaceId: 'workspaces', createdBy: 'py_personas' },
      channelMembers: { channelId: 'channels', personaId: 'py_personas' },
      messages: { channelId: 'channels' },
      reactions: { messageId: 'messages', personaId: 'py_personas' },
      files: { channelId: 'channels', uploadedBy: 'py_personas' },
      presence: { personaId: 'py_personas' },
      reads: { channelId: 'channels', personaId: 'py_personas' },
      huddles: { channelId: 'channels', startedBy: 'py_personas' },
    },
    timestamps: {
      workspaces: ['createdAt'],
      channels: ['createdAt', 'lastMessageAt'],
      messages: ['at'],
      reactions: ['at'],
      files: ['at'],
      presence: ['updatedAt'],
      huddles: ['startedAt'],
    },
  },
  timeline: teamChatTimeline,
  applyEvent: applyTeamChatEvent,
});
