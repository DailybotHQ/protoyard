import type { PolicyDefinition } from '@protoyard/core';
import {
  type Blueprint,
  type BlueprintEntity,
  ENTITY_ACTIONS,
  type EntityAction,
} from './schema.ts';
import { relationProperty } from './storage.ts';

export type EntityCapabilityMap = Record<
  string,
  {
    read: string;
    create: string;
    update: string;
    updateOwn: string;
    delete: string;
    deleteOwn: string;
    import: string;
    export: string;
  }
> & { members: { all: 'members:*' } };

/** Builds the capability names used by generated UIs and services. */
export const CAPABILITIES = (blueprint: Blueprint): EntityCapabilityMap => {
  const result: Record<string, EntityCapabilityMap[string]> = {};
  for (const entity of blueprint.entities) {
    const capability = (action: EntityAction) => `${entity.name}:${action}`;
    result[entity.name] = {
      read: capability('read'),
      create: capability('create'),
      update: capability('update'),
      updateOwn: capability('update:own'),
      delete: capability('delete'),
      deleteOwn: capability('delete:own'),
      import: capability('import'),
      export: capability('export'),
    };
  }
  return Object.assign(result, { members: { all: 'members:*' as const } });
};

/**
 * Converts declarative blueprint permissions to the runtime's capability policy.
 * Policies are a UX simulation and are never a security boundary.
 */
export function derivePolicy(blueprint: Blueprint): PolicyDefinition {
  const roles: Record<string, readonly string[]> = {};
  const rules: NonNullable<PolicyDefinition['rules']> = {};

  for (const entity of blueprint.entities) {
    const ownerField = entity.fields.find((field) => field.name === entity.ownerField);
    const ownerProperty = ownerField ? relationProperty(ownerField) : undefined;
    if (!ownerProperty) continue;
    for (const action of ['update:own', 'delete:own'] as const) {
      const capability = `${entity.name}:${action}`;
      rules[capability] = (principal, resource) => {
        if (principal.role === 'owner' || principal.role === 'admin') return true;
        if (resource === null || typeof resource !== 'object') return false;
        return (resource as Record<string, unknown>)[ownerProperty] === principal.persona.id;
      };
    }
  }

  for (const role of blueprint.roles) {
    const capabilities = new Set<string>();
    for (const [target, actions] of Object.entries(role.permissions)) {
      const entities =
        target === '*'
          ? blueprint.entities
          : blueprint.entities.filter((entity) => entity.name === target);
      for (const rawAction of actions as readonly string[]) {
        addActionCapabilities(capabilities, target, entities, rawAction);
      }
    }
    // Team membership is a platform capability rather than a blueprint entity.
    // Owners and admins manage memberships; a global wildcard grant also opts in.
    if (role.name === 'owner' || role.name === 'admin' || capabilities.has('*')) {
      capabilities.add('members:*');
    }
    roles[role.name] = [...capabilities];
  }

  return { roles, rules };
}

function addActionCapabilities(
  capabilities: Set<string>,
  target: string,
  entities: readonly BlueprintEntity[],
  rawAction: string
) {
  if (rawAction === '*' && target === '*') {
    capabilities.add('*');
    return;
  }
  if (rawAction.startsWith('-')) {
    const denied = rawAction.slice(1);
    const entityQualified = entities.some((entity) => denied.startsWith(`${entity.name}:`));
    if (denied.includes(':') && entityQualified) {
      capabilities.add(`-${denied}`);
      return;
    }
    if (denied === '*') {
      for (const entity of entities) {
        for (const action of ENTITY_ACTIONS) capabilities.add(`-${entity.name}:${action}`);
      }
      return;
    }
    for (const entity of entities) capabilities.add(`-${entity.name}:${denied}`);
    return;
  }
  if (rawAction === '*') {
    for (const entity of entities) {
      for (const action of ENTITY_ACTIONS) capabilities.add(`${entity.name}:${action}`);
    }
    return;
  }
  for (const entity of entities) capabilities.add(`${entity.name}:${rawAction}`);
}
