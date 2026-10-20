import { describe, expect, it } from 'vitest';
import { parseBlueprint } from '../../src/schema.ts';
import {
  checkWorkflowTransition,
  validateWorkflowDefinition,
  type WorkflowDefinitionInput,
} from '../../src/workflows/index.ts';

const blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Issue tracker',
  entities: [
    {
      name: 'ticket',
      plural: 'tickets',
      fields: [
        { name: 'status', kind: 'enum', values: ['open', 'blocked', 'done'] },
        { name: 'priority', kind: 'integer' },
      ],
      titleField: 'status',
    },
  ],
  roles: [
    { name: 'agent', permissions: { ticket: ['read', 'update'] } },
    { name: 'viewer', permissions: { ticket: ['read'] } },
  ],
});

const workflow: WorkflowDefinitionInput = {
  entity: 'ticket',
  field: 'status',
  initialState: 'open',
  states: [
    { id: 'open', label: 'Open' },
    { id: 'blocked', label: 'Blocked' },
    { id: 'done', label: 'Done' },
  ],
  transitions: [
    {
      from: 'open',
      to: 'blocked',
      label: 'Block ticket',
      guards: [{ field: 'priority', equals: 1 }],
      authorization: { roles: ['agent'], capability: 'ticket:update' },
    },
    { from: 'blocked', to: 'done' },
  ],
};

function reason(result: ReturnType<typeof checkWorkflowTransition>): string {
  return result.allowed ? 'allowed' : result.reason;
}

describe('workflow state model', () => {
  it('validates state values, initial state, transition endpoints and role capabilities', () => {
    expect(validateWorkflowDefinition(workflow, blueprint)).toMatchObject({ valid: true });

    const invalid = validateWorkflowDefinition(
      {
        ...workflow,
        initialState: 'missing',
        states: [...workflow.states, { id: 'unknown' }],
        transitions: [
          ...workflow.transitions,
          {
            from: 'missing',
            to: 'unknown',
            authorization: { roles: ['ghost'], capability: 'ticket:delete' },
          },
        ],
      },
      blueprint
    );
    expect(invalid.valid).toBe(false);
    if (invalid.valid) throw new Error('expected invalid workflow diagnostics');
    expect(invalid.diagnostics.map((item) => item.path)).toContainEqual(['initialState']);
    expect(invalid.diagnostics.map((item) => item.path)).toContainEqual(['states', 3, 'id']);
    expect(invalid.diagnostics.map((item) => item.path)).toContainEqual(['transitions', 2, 'from']);
    expect(invalid.diagnostics.map((item) => item.path)).toContainEqual([
      'transitions',
      2,
      'authorization',
      'roles',
      0,
    ]);
  });

  it('rejects missing or mismatched guard fields and non-enum workflow fields', () => {
    const guard = validateWorkflowDefinition(
      {
        ...workflow,
        transitions: [
          { from: 'open', to: 'blocked', guards: [{ field: 'absent', equals: 'yes' }] },
          { from: 'blocked', to: 'done', guards: [{ field: 'priority', equals: 'high' }] },
        ],
      },
      blueprint
    );
    expect(guard.valid).toBe(false);
    if (guard.valid) throw new Error('expected invalid guard diagnostics');
    expect(guard.diagnostics.map((item) => item.path)).toContainEqual([
      'transitions',
      0,
      'guards',
      0,
      'field',
    ]);
    expect(guard.diagnostics.map((item) => item.path)).toContainEqual([
      'transitions',
      1,
      'guards',
      0,
      'equals',
    ]);

    expect(validateWorkflowDefinition({ ...workflow, field: 'priority' }, blueprint)).toMatchObject(
      {
        valid: false,
        diagnostics: [{ path: ['field'] }],
      }
    );
  });

  it('deterministically allows only declared transitions with passing guards and authorization', () => {
    const validation = validateWorkflowDefinition(workflow, blueprint);
    if (!validation.valid) throw new Error('test workflow must validate');
    const definition = validation.workflow;

    expect(
      checkWorkflowTransition(definition, 'open', 'blocked', {
        role: 'agent',
        capabilities: ['ticket:update'],
        record: { priority: 1 },
      })
    ).toMatchObject({ allowed: true });
    expect(reason(checkWorkflowTransition(definition, 'open', 'done'))).toBe(
      'transition-not-allowed'
    );
    expect(
      reason(
        checkWorkflowTransition(definition, 'open', 'blocked', {
          role: 'agent',
          capabilities: ['ticket:update'],
          record: { priority: 2 },
        })
      )
    ).toBe('field-guard-failed');
    expect(
      reason(
        checkWorkflowTransition(definition, 'open', 'blocked', {
          role: 'viewer',
          capabilities: ['ticket:update'],
          record: { priority: 1 },
        })
      )
    ).toBe('role-not-authorized');
    expect(
      reason(
        checkWorkflowTransition(definition, 'open', 'blocked', {
          role: 'agent',
          capabilities: [],
          record: { priority: 1 },
        })
      )
    ).toBe('capability-not-held');
    expect(
      reason(
        checkWorkflowTransition(definition, 'open', 'blocked', {
          role: 'agent',
          capabilities: ['*', '-ticket:update'],
          record: { priority: 1 },
        })
      )
    ).toBe('capability-not-held');
    expect(reason(checkWorkflowTransition(definition, 'unknown', 'done'))).toBe('unknown-state');
  });

  it('rejects executable properties instead of interpreting them', () => {
    const invalid = validateWorkflowDefinition(
      { ...workflow, transitions: [{ from: 'open', to: 'blocked', run: 'return true' }] },
      blueprint
    );
    expect(invalid.valid).toBe(false);
  });
});
