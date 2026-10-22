import { describe, expect, it } from 'vitest';
import {
  type BlueprintInput,
  blueprintJsonSchema,
  evaluateValidationSuccess,
  parseBlueprint,
  safeParseBlueprint,
  type ValidationObservation,
  ValidationSchema,
  validationBaseline,
} from '../src/index.ts';

/** A fictional fitness studio where people book classes. */
function studio(validation?: unknown): BlueprintInput {
  return {
    formatVersion: 1,
    name: 'Brightside Studio',
    entities: [
      {
        name: 'fitness-class',
        plural: 'fitness-classes',
        fields: [
          { name: 'title', kind: 'text', required: true },
          { name: 'weekday', kind: 'enum', values: ['monday', 'friday'] },
          { name: 'capacity', kind: 'integer', min: 1, max: 40 },
          { name: 'outdoor', kind: 'boolean' },
          { name: 'labels', kind: 'tags' },
          { name: 'extra', kind: 'json' },
        ],
        titleField: 'title',
      },
      {
        name: 'booking',
        plural: 'bookings',
        fields: [
          { name: 'member', kind: 'text', required: true },
          { name: 'note', kind: 'longText' },
        ],
        titleField: 'member',
      },
    ],
    roles: [{ name: 'member', permissions: { '*': ['*'] } }],
    ...(validation === undefined ? {} : { validation }),
  } as BlueprintInput;
}

const bookFriday = {
  id: 'book-friday',
  prompt: 'Book a class for Friday.',
  timeLimitSeconds: 120,
  success: {
    route: { path: '/bookings', match: 'prefix' },
    data: { op: 'count>=', entity: 'booking', value: 1 },
  },
};

function issues(validation: unknown): string[] {
  const result = safeParseBlueprint(studio(validation));
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('validation.tasks schema', () => {
  it('is optional and leaves ordinary blueprints unchanged', () => {
    expect(parseBlueprint(studio()).validation).toBeUndefined();
  });

  it('parses valid task blocks and applies defaults', () => {
    const blueprint = parseBlueprint(
      studio({
        tasks: [
          bookFriday,
          {
            id: 'find-yoga',
            prompt: 'Open the yoga class.',
            success: { route: { path: '/fitness-classes' } },
          },
          {
            id: 'friday-class',
            prompt: 'Make a Friday class.',
            success: {
              data: { op: 'eq', entity: 'fitness-class', field: 'weekday', value: 'friday' },
            },
          },
          {
            id: 'yoga-title',
            prompt: 'Name a class Yoga.',
            success: {
              data: { op: 'contains', entity: 'fitness-class', field: 'title', value: 'yoga' },
            },
          },
        ],
      })
    );
    const [first, second, third] = blueprint.validation?.tasks ?? [];
    expect(first?.success.data).toEqual({
      op: 'count>=',
      entity: 'booking',
      value: 1,
      from: 'task-start',
    });
    expect(second?.success.route).toEqual({ path: '/fitness-classes', match: 'exact' });
    expect(third?.timeLimitSeconds).toBeUndefined();
  });

  it('rejects unknown ops, expressions and extra keys', () => {
    const op = (data: unknown) => issues({ tasks: [{ ...bookFriday, success: { data } }] });
    expect(op({ op: 'gt', entity: 'booking', value: 1 }).join()).toMatch(/op/);
    expect(op({ op: 'eval', entity: 'booking', value: 'process.exit()' }).join()).toMatch(/op/);
    expect(
      op({ op: 'eq', entity: 'booking', field: 'member', value: 'x', where: '1==1' }).join()
    ).toMatch(/where|Unrecognized/i);
    expect(op({ op: 'eq', entity: 'booking', field: 'member', value: { $gt: 1 } }).join()).toMatch(
      /value/
    );
    expect(issues({ tasks: [{ ...bookFriday, script: 'alert(1)' }] }).join()).toMatch(
      /script|Unrecognized/i
    );
  });

  it('rejects empty conditions, bad routes, ids, prompts and limits', () => {
    const task = (patch: Record<string, unknown>) =>
      issues({ tasks: [{ ...bookFriday, ...patch }] });
    expect(task({ success: {} }).join()).toMatch(/route, a data predicate, or both/);
    for (const path of ['bookings', '/a/../b', '/a?x=1', '/a#b', 'javascript:alert(1)', '/a b']) {
      expect(task({ success: { route: { path } } }).join(), path).toMatch(/path/);
    }
    expect(task({ id: 'Book Friday' }).join()).toMatch(/id/);
    expect(task({ prompt: '   ' }).join()).toMatch(/prompt/);
    expect(task({ prompt: 'x'.repeat(281) }).join()).toMatch(/prompt/);
    expect(task({ timeLimitSeconds: 5 }).join()).toMatch(/timeLimitSeconds/);
    expect(issues({ tasks: [] }).join()).toMatch(/at least one task/);
    expect(
      issues({
        tasks: Array.from({ length: 21 }, (_, i) => ({ ...bookFriday, id: `t-${i}` })),
      }).join()
    ).toMatch(/tasks/);
  });

  it('cross-checks ids, entities, fields and value types', () => {
    const data = (value: unknown) =>
      issues({ tasks: [{ ...bookFriday, success: { data: value } }] }).join(' | ');
    expect(issues({ tasks: [bookFriday, bookFriday] }).join()).toMatch(
      /duplicate task id "book-friday"/
    );
    expect(data({ op: 'count>=', entity: 'invoice', value: 1 })).toMatch(
      /unknown entity "invoice"/
    );
    expect(data({ op: 'eq', entity: 'booking', field: 'seat', value: 'x' })).toMatch(
      /has no field "seat"/
    );
    expect(
      data({ op: 'contains', entity: 'fitness-class', field: 'capacity', value: '4' })
    ).toMatch(/contains needs a text/);
    expect(data({ op: 'eq', entity: 'fitness-class', field: 'capacity', value: '4' })).toMatch(
      /value must be a number/
    );
    expect(data({ op: 'eq', entity: 'fitness-class', field: 'outdoor', value: 'yes' })).toMatch(
      /value must be a boolean/
    );
    expect(data({ op: 'eq', entity: 'fitness-class', field: 'extra', value: 'x' })).toMatch(
      /cannot compare a json/
    );
    expect(data({ op: 'eq', entity: 'fitness-class', field: 'outdoor', value: true })).toBe('');
    expect(data({ op: 'contains', entity: 'fitness-class', field: 'labels', value: 'hiit' })).toBe(
      ''
    );
  });

  it('is part of the app branch of the JSON Schema export', async () => {
    const schema = (await blueprintJsonSchema()) as {
      oneOf: { properties: Record<string, unknown> }[];
    };
    const validation = schema.oneOf[0]?.properties.validation;
    expect(validation).toBeDefined();
    expect(JSON.stringify(validation)).toContain('count>=');
  });
});

describe('evaluateValidationSuccess', () => {
  const tasks = ValidationSchema.parse({
    tasks: [
      bookFriday,
      { id: 'exact', prompt: 'Open settings.', success: { route: { path: '/settings/' } } },
      {
        id: 'tagged',
        prompt: 'Tag a class.',
        success: {
          data: { op: 'contains', entity: 'fitness-class', field: 'labels', value: 'HIIT' },
        },
      },
      {
        id: 'total',
        prompt: 'Have three bookings.',
        success: { data: { op: 'count>=', entity: 'booking', value: 3, from: 'zero' } },
      },
      {
        id: 'cleared',
        prompt: 'Clear the note.',
        success: { data: { op: 'eq', entity: 'booking', field: 'note', value: null } },
      },
    ],
  }).tasks;
  const success = (id: string) => {
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task) throw new Error(id);
    return task.success;
  };
  const before: ValidationObservation['rows'] = {
    booking: [{ member: 'Rae Example', note: 'window seat' }],
    'fitness-class': [{ title: 'Morning Flow', labels: ['yoga', 'hiit-lite'] }],
  };
  const baseline = validationBaseline(before);

  it('needs both parts when both are given, relative to the task start', () => {
    expect(baseline).toEqual({ booking: 1, 'fitness-class': 1 });
    const start = { route: '/bookings', rows: before, baseline };
    expect(evaluateValidationSuccess(success('book-friday'), start)).toEqual({
      met: false,
      route: true,
      data: false,
    });
    const after = {
      route: '/bookings/b-2?tab=details',
      rows: {
        ...before,
        booking: [...(before.booking ?? []), { member: 'Sam Example', note: null }],
      },
      baseline,
    };
    expect(evaluateValidationSuccess(success('book-friday'), after)).toEqual({
      met: true,
      route: true,
      data: true,
    });
    expect(
      evaluateValidationSuccess(success('book-friday'), { ...after, route: '/booking' })
    ).toMatchObject({
      met: false,
      route: false,
    });
    expect(evaluateValidationSuccess(success('cleared'), after).met).toBe(true);
  });

  it('matches routes exactly or by prefix, ignoring trailing slashes and queries', () => {
    const at = (route: string) =>
      evaluateValidationSuccess(success('exact'), { route, rows: {} }).met;
    expect(at('/settings')).toBe(true);
    expect(at('#/settings/?x=1')).toBe(true);
    expect(at('/settings/profile')).toBe(false);
    expect(at('/settingsx')).toBe(false);
  });

  it('reads tags and text case-insensitively and counts from zero when asked', () => {
    expect(evaluateValidationSuccess(success('tagged'), { route: '/', rows: before }).data).toBe(
      true
    );
    expect(evaluateValidationSuccess(success('total'), { route: '/', rows: before }).data).toBe(
      false
    );
    expect(evaluateValidationSuccess(success('total'), { route: '/', rows: {} }).data).toBe(false);
  });

  it('is pure and deterministic', () => {
    const observation = { route: '/bookings', rows: before, baseline };
    const frozen = JSON.stringify(observation);
    const runs = Array.from({ length: 5 }, () =>
      tasks.map((task) => evaluateValidationSuccess(task.success, observation))
    );
    for (const run of runs) expect(run).toEqual(runs[0]);
    expect(JSON.stringify(observation)).toBe(frozen);
  });
});
