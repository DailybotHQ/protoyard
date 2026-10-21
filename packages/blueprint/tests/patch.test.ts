import { describe, expect, it } from 'vitest';
import {
  applyBlueprintPatch,
  applyJsonPatch,
  type Blueprint,
  type BlueprintInput,
  BlueprintPatchError,
  jsonEqual,
  parseBlueprint,
  parseJsonPointer,
} from '../src/index.ts';

function patchError(run: () => unknown): BlueprintPatchError {
  try {
    run();
  } catch (error) {
    if (error instanceof BlueprintPatchError) return error;
    throw error;
  }
  throw new Error('expected a BlueprintPatchError');
}

/** RFC 6902 Appendix A: [name, document, patch, expected result or error code]. */
const RFC_APPENDIX_A: [string, unknown, unknown[], unknown][] = [
  [
    'A.1 add an object member',
    { foo: 'bar' },
    [{ op: 'add', path: '/baz', value: 'qux' }],
    { baz: 'qux', foo: 'bar' },
  ],
  [
    'A.2 add an array element',
    { foo: ['bar', 'baz'] },
    [{ op: 'add', path: '/foo/1', value: 'qux' }],
    { foo: ['bar', 'qux', 'baz'] },
  ],
  [
    'A.3 remove an object member',
    { baz: 'qux', foo: 'bar' },
    [{ op: 'remove', path: '/baz' }],
    { foo: 'bar' },
  ],
  [
    'A.4 remove an array element',
    { foo: ['bar', 'qux', 'baz'] },
    [{ op: 'remove', path: '/foo/1' }],
    { foo: ['bar', 'baz'] },
  ],
  [
    'A.5 replace a value',
    { baz: 'qux', foo: 'bar' },
    [{ op: 'replace', path: '/baz', value: 'boo' }],
    { baz: 'boo', foo: 'bar' },
  ],
  [
    'A.6 move a value',
    { foo: { bar: 'baz', waldo: 'fred' }, qux: { corge: 'grault' } },
    [{ op: 'move', from: '/foo/waldo', path: '/qux/thud' }],
    { foo: { bar: 'baz' }, qux: { corge: 'grault', thud: 'fred' } },
  ],
  [
    'A.7 move an array element',
    { foo: ['all', 'grass', 'cows', 'eat'] },
    [{ op: 'move', from: '/foo/1', path: '/foo/3' }],
    { foo: ['all', 'cows', 'eat', 'grass'] },
  ],
  [
    'A.8 test a value: success',
    { baz: 'qux', foo: ['a', 2, 'c'] },
    [
      { op: 'test', path: '/baz', value: 'qux' },
      { op: 'test', path: '/foo/1', value: 2 },
    ],
    { baz: 'qux', foo: ['a', 2, 'c'] },
  ],
  [
    'A.9 test a value: error',
    { baz: 'qux' },
    [{ op: 'test', path: '/baz', value: 'bar' }],
    'test-failed',
  ],
  [
    'A.10 add a nested member object',
    { foo: 'bar' },
    [{ op: 'add', path: '/child', value: { grandchild: {} } }],
    { foo: 'bar', child: { grandchild: {} } },
  ],
  [
    'A.11 ignore unrecognized elements',
    { foo: 'bar' },
    [{ op: 'add', path: '/baz', value: 'qux', xyz: 123 }],
    { foo: 'bar', baz: 'qux' },
  ],
  [
    'A.12 add to a nonexistent target',
    { foo: 'bar' },
    [{ op: 'add', path: '/baz/bat', value: 'qux' }],
    'path-not-found',
  ],
  [
    'A.13 extra members are ignored (a duplicate "op" key cannot survive JSON.parse)',
    { foo: 'bar' },
    [{ op: 'add', path: '/baz', value: 'qux', op2: 'remove' }],
    { foo: 'bar', baz: 'qux' },
  ],
  [
    'A.14 ~ escape ordering',
    { '/': 9, '~1': 10 },
    [{ op: 'test', path: '/~01', value: 10 }],
    { '/': 9, '~1': 10 },
  ],
  [
    'A.15 comparing strings and numbers',
    { '/': 9, '~1': 10 },
    [{ op: 'test', path: '/~01', value: '10' }],
    'test-failed',
  ],
  [
    'A.16 add an array value',
    { foo: ['bar'] },
    [{ op: 'add', path: '/foo/-', value: ['abc', 'def'] }],
    { foo: ['bar', ['abc', 'def']] },
  ],
];

describe('RFC 6902 conformance', () => {
  for (const [name, document, patch, expected] of RFC_APPENDIX_A) {
    it(name, () => {
      const before = JSON.stringify(document);
      if (typeof expected === 'string') {
        expect(patchError(() => applyJsonPatch(document, patch)).code).toBe(expected);
      } else {
        expect(applyJsonPatch(document, patch)).toEqual(expected);
      }
      expect(JSON.stringify(document)).toBe(before);
    });
  }

  it('handles the whole-document pointer, copy, and edge indexes', () => {
    expect(applyJsonPatch({ a: 1 }, [{ op: 'replace', path: '', value: [1] }])).toEqual([1]);
    expect(applyJsonPatch({ a: 1 }, [{ op: 'add', path: '', value: { b: 2 } }])).toEqual({ b: 2 });
    expect(applyJsonPatch({ a: { b: [1] } }, [{ op: 'copy', from: '/a', path: '/c' }])).toEqual({
      a: { b: [1] },
      c: { b: [1] },
    });
    const copied = applyJsonPatch({ a: { b: [1] } }, [
      { op: 'copy', from: '/a', path: '/c' },
      { op: 'add', path: '/c/b/-', value: 2 },
    ]) as { a: { b: number[] } };
    expect(copied.a.b).toEqual([1]);
    expect(applyJsonPatch([1, 2], [{ op: 'add', path: '/2', value: 3 }])).toEqual([1, 2, 3]);
    expect(applyJsonPatch({ a: 1 }, [{ op: 'move', from: '/a', path: '/a' }])).toEqual({ a: 1 });
    expect(applyJsonPatch({ '': 1, 'a b': 2 }, [{ op: 'remove', path: '/' }])).toEqual({
      'a b': 2,
    });
    expect(applyJsonPatch({ a: null }, [{ op: 'test', path: '/a', value: null }])).toEqual({
      a: null,
    });
    for (const [doc, op] of [
      [[1, 2], { op: 'add', path: '/3', value: 0 }],
      [[1, 2], { op: 'remove', path: '/-' }],
      [[1, 2], { op: 'replace', path: '/01', value: 0 }],
      [{ a: 1 }, { op: 'remove', path: '/b' }],
      [{ a: 1 }, { op: 'replace', path: '/b', value: 1 }],
      [{ a: 1 }, { op: 'copy', from: '/b', path: '/c' }],
      [{ a: 1 }, { op: 'remove', path: '/toString' }],
      [{ a: 1 }, { op: 'remove', path: '' }],
    ] as const) {
      expect(patchError(() => applyJsonPatch(doc, [op])).code, JSON.stringify(op)).toBe(
        'path-not-found'
      );
    }
  });

  it('bounds cumulative nodes when copying the document repeatedly', () => {
    const patch = Array.from({ length: 25 }, (_, index) => ({
      op: 'copy' as const,
      from: '',
      path: `/copy${index}`,
    }));
    const error = patchError(() => applyJsonPatch({ value: { nested: [1, 2, 3] } }, patch));
    expect(error.code).toBe('invalid-patch');
    expect(error.message).toContain('node budget');
  });

  it('refuses malformed patches and is atomic', () => {
    const document = { list: [1, 2, 3] };
    for (const patch of [
      {},
      [{ op: 'nope', path: '/a' }],
      [{ op: 'add', path: '/a' }],
      [{ op: 'move', path: '/a' }],
      [{ op: 'add', path: 7, value: 1 }],
      [{ op: 'add', path: '/a', value: Number.POSITIVE_INFINITY }],
      [{ op: 'move', from: '/list', path: '/list/0' }],
      Array.from({ length: 1001 }, () => ({ op: 'test', path: '', value: 1 })),
    ]) {
      expect(
        patchError(() => applyJsonPatch(document, patch)).code,
        JSON.stringify(patch).slice(0, 80)
      ).toBe('invalid-patch');
    }
    const error = patchError(() =>
      applyJsonPatch(document, [
        { op: 'add', path: '/list/-', value: 4 },
        { op: 'test', path: '/list/0', value: 9 },
      ])
    );
    expect(error.index).toBe(1);
    expect(document).toEqual({ list: [1, 2, 3] });
  });

  it('parses pointers and compares JSON values', () => {
    expect(parseJsonPointer('')).toEqual([]);
    expect(parseJsonPointer('/a~1b/c~0d/')).toEqual(['a/b', 'c~d', '']);
    for (const bad of ['a', '/~2', '/x~']) expect(() => parseJsonPointer(bad), bad).toThrow();
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(jsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });
});

describe('prototype pollution', () => {
  it('refuses pointers to __proto__, constructor and prototype', () => {
    for (const path of [
      '/__proto__/polluted',
      '/constructor/prototype/polluted',
      '/a/prototype',
      '/__proto__',
    ]) {
      const error = patchError(() => applyJsonPatch({ a: {} }, [{ op: 'add', path, value: true }]));
      expect(error.code, path).toBe('unsafe-pointer');
    }
    expect(
      patchError(() => applyJsonPatch({ a: 1 }, [{ op: 'copy', from: '/__proto__', path: '/b' }]))
        .code
    ).toBe('unsafe-pointer');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuses prototype-reaching keys inside values', () => {
    const value = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(patchError(() => applyJsonPatch({}, [{ op: 'add', path: '/a', value }])).code).toBe(
      'invalid-patch'
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

/** A fictional booking studio. */
const base: Blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Brightside Studio',
  entities: [
    {
      name: 'booking',
      plural: 'bookings',
      fields: [
        { name: 'member', kind: 'text', required: true },
        { name: 'note', kind: 'longText' },
      ],
      titleField: 'member',
    },
    {
      name: 'room',
      plural: 'rooms',
      fields: [{ name: 'name', kind: 'text', required: true }],
      titleField: 'name',
    },
  ],
  roles: [{ name: 'member', permissions: { '*': ['*'] } }],
} as BlueprintInput);

describe('applyBlueprintPatch', () => {
  it('returns a valid blueprint and the migration that keeps data', () => {
    const result = applyBlueprintPatch(base, [
      { op: 'test', path: '/entities/0/name', value: 'booking' },
      {
        op: 'add',
        path: '/entities/0/fields/-',
        value: { name: 'paid', kind: 'boolean', default: false },
      },
      { op: 'replace', path: '/name', value: 'Brightside Studio Plus' },
    ]);
    expect(result.blueprint.name).toBe('Brightside Studio Plus');
    expect(result.destructive).toBe(false);
    expect(result.migration?.version).toBe(2);
    expect(result.migration?.ops).toContainEqual(
      expect.objectContaining({ op: 'backfill', field: 'paid' })
    );
    expect(base.entities[0]?.fields).toHaveLength(2);
  });

  it('returns no migration when the data shape does not change', () => {
    const result = applyBlueprintPatch(base, [
      { op: 'add', path: '/description', value: 'Classes and rooms.' },
    ]);
    expect(result).toMatchObject({ migration: null, destructive: false });
  });

  it('needs allowDrop for destructive patches', () => {
    const dropField = [{ op: 'remove', path: '/entities/0/fields/1' }];
    const dropEntity = [{ op: 'remove', path: '/entities/1' }];
    for (const patch of [dropField, dropEntity]) {
      const error = patchError(() => applyBlueprintPatch(base, patch));
      expect(error.code).toBe('drop-requires-allow');
      expect(error.message).toMatch(/allowDrop/);
      const allowed = applyBlueprintPatch(base, patch, { allowDrop: true });
      expect(allowed.destructive).toBe(true);
    }
    expect(
      applyBlueprintPatch(base, dropEntity, { allowDrop: true }).migration?.stores.rooms
    ).toBeNull();
  });

  it('reports every schema issue for an invalid result', () => {
    const error = patchError(() =>
      applyBlueprintPatch(base, [
        { op: 'replace', path: '/entities/0/titleField', value: 'missing' },
        { op: 'add', path: '/unknownKey', value: 1 },
      ])
    );
    expect(error.code).toBe('invalid-result');
    expect(error.issues.length).toBeGreaterThanOrEqual(1);
    expect(error.message).toMatch(/patched blueprint is invalid/);
  });
});
