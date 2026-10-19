import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import {
  applyTaskEvent,
  generateTaskWorld,
  TASKS_GENERATOR_VERSION,
  taskTimeline,
} from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Wires protoyard.json to this prototype's schema, policy, scenarios,
 * generator and timeline. Read this file first: schema → policy → scenarios
 * → generator → services (src/domain/services.ts) → screens.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateTaskWorld,
  generatorVersion: TASKS_GENERATOR_VERSION,
  timeline: taskTimeline,
  applyEvent: applyTaskEvent,
  integrity: {
    relations: {
      projects: { ownerId: 'py_personas' },
      sprints: { projectId: 'projects' },
      tasks: { projectId: 'projects', assigneeId: 'py_personas', reporterId: 'py_personas' },
      comments: { taskId: 'tasks', authorId: 'py_personas', parentId: 'comments' },
      activity: { taskId: 'tasks', projectId: 'projects', actorId: 'py_personas' },
      dependencies: { projectId: 'projects', fromId: 'tasks', toId: 'tasks' },
      savedViews: { personaId: 'py_personas' },
    },
    timestamps: {
      projects: ['createdAt', 'updatedAt'],
      tasks: ['createdAt', 'updatedAt', 'completedAt'],
      comments: ['createdAt'],
      activity: ['at'],
      rituals: ['createdAt'],
      savedViews: ['createdAt'],
    },
  },
});
