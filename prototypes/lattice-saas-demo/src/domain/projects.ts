import type { PrototypeRuntime } from '@protoyard/core';
import { createRuntimeId, parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';
import type { Project } from '../database/schema.ts';
import { PROJECT_CAPABILITIES } from './policy.ts';
import { ProjectStatusSchema } from './schema.ts';

const PROJECTS = 'projects';

interface ProjectTable {
  add(row: Project): Promise<unknown>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<Project | undefined>;
  put(row: Project): Promise<unknown>;
  where(index: string): { equals(value: string): { toArray(): Promise<Project[]> } };
}

interface DatabaseLike {
  table(name: string): ProjectTable;
  transaction<T>(mode: 'rw', tables: string[], work: () => Promise<T>): Promise<T>;
}

const ProjectInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters').max(80),
  summary: z.string().trim().max(240).default(''),
  status: ProjectStatusSchema.default('planning'),
});

const ProjectUpdateSchema = ProjectInputSchema.extend({ id: z.string().min(1) });
export type ProjectInput = z.input<typeof ProjectInputSchema>;
export type ProjectUpdate = z.input<typeof ProjectUpdateSchema>;

export function createProjectServices(runtime: PrototypeRuntime) {
  const db = runtime.db as unknown as DatabaseLike;
  const projects = () => db.table(PROJECTS);

  function principal() {
    const current = runtime.session.principal();
    if (!current) throw new ValidationError({ form: 'Sign in to manage projects.' });
    if (!current.organization) {
      throw new ValidationError({ form: 'Choose a workspace before managing projects.' });
    }
    return { current, organization: current.organization };
  }

  return {
    async list(): Promise<Project[]> {
      const { organization } = principal();
      runtime.session.assert(PROJECT_CAPABILITIES.read, {
        organizationId: organization.id,
      });
      return projects().where('organizationId').equals(organization.id).toArray();
    },

    async create(input: ProjectInput): Promise<Project> {
      const { current, organization } = principal();
      runtime.session.assert(PROJECT_CAPABILITIES.create, {
        organizationId: organization.id,
      });
      const data = parseInput(ProjectInputSchema, input);
      const now = runtime.clock.now().toISOString();
      return runtime.environment.run('projects.create', () =>
        db.transaction('rw', [PROJECTS], async () => {
          const row: Project = {
            id: createRuntimeId('project'),
            organizationId: organization.id,
            ownerPersonaId: current.persona.id,
            ...data,
            createdAt: now,
            updatedAt: now,
          };
          await projects().add(row);
          return row;
        })
      );
    },

    async update(input: ProjectUpdate): Promise<Project> {
      const { organization } = principal();
      runtime.session.assert(PROJECT_CAPABILITIES.update, {
        organizationId: organization.id,
      });
      const data = parseInput(ProjectUpdateSchema, input);
      return runtime.environment.run('projects.update', () =>
        db.transaction('rw', [PROJECTS], async () => {
          const existing = await projects().get(data.id);
          if (!existing || existing.organizationId !== organization.id) {
            throw new ValidationError({ id: 'Project not found in this workspace.' });
          }
          const updated: Project = {
            ...existing,
            ...data,
            updatedAt: runtime.clock.now().toISOString(),
          };
          await projects().put(updated);
          return updated;
        })
      );
    },

    async remove(id: string): Promise<void> {
      const { organization } = principal();
      runtime.session.assert(PROJECT_CAPABILITIES.delete, {
        organizationId: organization.id,
      });
      const projectId = parseInput(z.string().min(1), id);
      return runtime.environment.run('projects.delete', () =>
        db.transaction('rw', [PROJECTS], async () => {
          const existing = await projects().get(projectId);
          if (!existing || existing.organizationId !== organization.id) {
            throw new ValidationError({ id: 'Project not found in this workspace.' });
          }
          await projects().delete(projectId);
        })
      );
    },
  };
}

export type ProjectServices = ReturnType<typeof createProjectServices>;
