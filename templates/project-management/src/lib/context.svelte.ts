import type { PrototypeRuntime } from '@protoyard/core';
import { avatarImage, getRuntime, liveQuery } from '@protoyard/renderer-svelte';
import type { PickerUser } from '@protoyard/ui';
import { getContext, setContext } from 'svelte';
import type { TaskDatabase } from '../database/schema.ts';
import { ROLE_LABELS } from '../domain/policy.ts';
import { createTaskServices, type TaskServices } from '../domain/services.ts';

const KEY = Symbol('project-management');

export interface Person {
  id: string;
  name: string;
  title: string;
  role: string;
  /** `persona.avatar` (library id or URL); resolve with `avatarImage`. */
  avatar?: string;
}

export interface Workspace {
  runtime: PrototypeRuntime<TaskDatabase>;
  db: TaskDatabase;
  services: TaskServices;
  /** Everyone in the workspace (live: follows scenario loads and persona changes). */
  readonly people: Person[];
  readonly peopleById: Map<string, Person>;
  /** People who can be assigned tasks (not viewers), for the UserPicker. */
  readonly assignable: PickerUser[];
}

/** Called once in App.svelte; screens read it with `useWorkspace()`. */
export function provideWorkspace(): Workspace {
  const runtime = getRuntime() as unknown as PrototypeRuntime<TaskDatabase>;
  const db = runtime.db;
  const people = liveQuery(
    async (): Promise<Person[]> => {
      const [personas, memberships] = await Promise.all([
        db.table('py_personas').toArray() as Promise<
          { id: string; name: string; title?: string; avatar?: string }[]
        >,
        db.table('py_memberships').toArray() as Promise<{ personaId: string; role: string }[]>,
      ]);
      const roles = new Map(memberships.map((m) => [m.personaId, m.role]));
      return personas
        .map((p) => ({
          id: p.id,
          name: p.name,
          title: p.title ?? '',
          role: roles.get(p.id) ?? 'viewer',
          ...(p.avatar ? { avatar: p.avatar } : {}),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    { initial: [] }
  );
  const byId = $derived(new Map((people.current ?? []).map((p) => [p.id, p])));
  const assignable = $derived(
    (people.current ?? [])
      .filter((p) => p.role !== 'viewer')
      .map((p) => {
        const image = avatarImage(p.avatar);
        return {
          id: p.id,
          name: p.name,
          subtitle: p.title || ROLE_LABELS[p.role],
          ...(image.src ? { avatarUrl: image.src } : {}),
          ...(image.srcset ? { avatarSrcset: image.srcset } : {}),
        };
      })
  );
  const workspace: Workspace = {
    runtime,
    db,
    services: createTaskServices(runtime),
    get people() {
      return people.current ?? [];
    },
    get peopleById() {
      return byId;
    },
    get assignable() {
      return assignable;
    },
  };
  setContext(KEY, workspace);
  return workspace;
}

export function useWorkspace(): Workspace {
  const workspace = getContext<Workspace | undefined>(KEY);
  if (!workspace) throw new Error('useWorkspace() must be used inside App.svelte');
  return workspace;
}
