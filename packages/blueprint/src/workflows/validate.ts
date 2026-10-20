import type { Blueprint } from '../schema.ts';
import { type WorkflowDefinition, WorkflowDefinitionSchema } from './schema.ts';

export type WorkflowDiagnostic = {
  path: (string | number)[];
  message: string;
};

export type WorkflowValidationResult =
  | { valid: true; workflow: WorkflowDefinition; diagnostics: [] }
  | { valid: false; workflow: null; diagnostics: WorkflowDiagnostic[] };

const ENTITY_ACTIONS = [
  'read',
  'create',
  'update',
  'update:own',
  'delete',
  'delete:own',
  'import',
  'export',
] as const;

function hasCapability(blueprint: Blueprint, roleName: string, capability: string): boolean {
  const role = blueprint.roles.find((candidate) => candidate.name === roleName);
  if (!role) return false;
  const separator = capability.indexOf(':');
  const entity = capability.slice(0, separator);
  const action = capability.slice(separator + 1);
  if (!ENTITY_ACTIONS.includes(action as (typeof ENTITY_ACTIONS)[number])) return false;

  let granted = false;
  let denied = false;
  for (const [target, permissions] of Object.entries(role.permissions)) {
    if (target !== '*' && target !== entity) continue;
    for (const permission of permissions) {
      if (permission === '*') {
        granted = true;
        continue;
      }
      if (permission.startsWith('-')) {
        const blocked = permission.slice(1);
        if (
          blocked === '*' ||
          blocked === capability ||
          (!blocked.includes(':') && (action === blocked || action.startsWith(`${blocked}:`)))
        ) {
          denied = true;
        }
      } else if (permission === action) {
        granted = true;
      }
    }
  }
  return granted && !denied;
}

/** Validate the workflow shape and its entity, enum states, role and capability references. */
export function validateWorkflowDefinition(
  input: unknown,
  blueprint: Blueprint
): WorkflowValidationResult {
  const parsed = WorkflowDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      workflow: null,
      diagnostics: parsed.error.issues.map((issue) => ({
        path: issue.path.filter(
          (part): part is string | number => typeof part === 'string' || typeof part === 'number'
        ),
        message: issue.message,
      })),
    };
  }

  const workflow = parsed.data;
  const diagnostics: WorkflowDiagnostic[] = [];
  const add = (path: (string | number)[], message: string) => diagnostics.push({ path, message });
  const entityIndex = blueprint.entities.findIndex((entity) => entity.name === workflow.entity);
  const entity = blueprint.entities[entityIndex];
  if (!entity) {
    add(['entity'], `Unknown workflow entity "${workflow.entity}".`);
  }
  const fieldIndex = entity?.fields.findIndex((field) => field.name === workflow.field) ?? -1;
  const field = fieldIndex >= 0 ? entity?.fields[fieldIndex] : undefined;
  if (entity && !field) {
    add(['field'], `Unknown field "${workflow.field}" on entity "${workflow.entity}".`);
  } else if (field && field.kind !== 'enum') {
    add(['field'], `Workflow field "${workflow.field}" must be an enum field.`);
  }

  const stateIds = new Set<string>();
  for (const [index, state] of workflow.states.entries()) {
    if (stateIds.has(state.id))
      add(['states', index, 'id'], `Duplicate workflow state "${state.id}".`);
    stateIds.add(state.id);
    if (field?.kind === 'enum' && !field.values.includes(state.id)) {
      add(
        ['states', index, 'id'],
        `State "${state.id}" is not a value of enum field "${workflow.field}".`
      );
    }
  }
  if (!stateIds.has(workflow.initialState)) {
    add(['initialState'], `Initial state "${workflow.initialState}" is not declared.`);
  }

  const roleNames = new Set(blueprint.roles.map((role) => role.name));
  const transitionPairs = new Set<string>();
  for (const [index, transition] of workflow.transitions.entries()) {
    const path = ['transitions', index] as (string | number)[];
    if (!stateIds.has(transition.from)) {
      add([...path, 'from'], `Unknown source state "${transition.from}".`);
    }
    if (!stateIds.has(transition.to)) {
      add([...path, 'to'], `Unknown destination state "${transition.to}".`);
    }
    if (transition.from === transition.to) {
      add(path, 'A transition must move to a different state.');
    }
    const pair = `${transition.from}\u0000${transition.to}`;
    if (transitionPairs.has(pair)) add(path, 'Duplicate transition for this state pair.');
    transitionPairs.add(pair);

    for (const [guardIndex, guard] of transition.guards.entries()) {
      const guardField = entity?.fields.find((candidate) => candidate.name === guard.field);
      const guardPath = [...path, 'guards', guardIndex, 'field'];
      if (!guardField) {
        add(guardPath, `Unknown guard field "${guard.field}" on entity "${workflow.entity}".`);
      } else {
        const compatible =
          (['text', 'longText', 'email', 'url', 'phone', 'date', 'datetime', 'enum'].includes(
            guardField.kind
          ) &&
            typeof guard.equals === 'string') ||
          (['number', 'integer', 'money'].includes(guardField.kind) &&
            typeof guard.equals === 'number') ||
          (guardField.kind === 'boolean' && typeof guard.equals === 'boolean');
        if (!compatible) {
          add(
            [...path, 'guards', guardIndex, 'equals'],
            `Guard value type does not match field "${guard.field}" (${guardField.kind}).`
          );
        }
      }
    }

    const authorization = transition.authorization;
    if (!authorization) continue;
    const capabilityPrefix = `${workflow.entity}:`;
    if (!authorization.capability.startsWith(capabilityPrefix)) {
      add(
        [...path, 'authorization', 'capability'],
        `Capability must belong to workflow entity "${workflow.entity}".`
      );
    }
    for (const [roleIndex, roleName] of authorization.roles.entries()) {
      if (!roleNames.has(roleName)) {
        add([...path, 'authorization', 'roles', roleIndex], `Unknown role "${roleName}".`);
      } else if (!hasCapability(blueprint, roleName, authorization.capability)) {
        add(
          [...path, 'authorization', 'roles', roleIndex],
          `Role "${roleName}" does not grant capability "${authorization.capability}".`
        );
      }
    }
  }

  return diagnostics.length > 0
    ? { valid: false, workflow: null, diagnostics }
    : { valid: true, workflow, diagnostics: [] };
}
