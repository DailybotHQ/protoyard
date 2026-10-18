import type { DatabaseDefinition } from '@protoyard/core';
import { saasStores } from '@protoyard/saas';
import type { Dexie, EntityTable } from 'dexie';

export const PROJECT_STATUSES = ['planning', 'active', 'complete'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type Project = {
  id: string;
  organizationId: string;
  ownerPersonaId: string;
  name: string;
  summary: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type B2bSaasDatabase = Dexie & {
  projects: EntityTable<Project, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        ...saasStores(1),
        projects: 'id, organizationId, ownerPersonaId, status, createdAt',
      },
    },
  ],
};
