import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CONTENT_KINDS,
  type ContentKind,
  parseBlueprint,
  safeParseBlueprint,
  validateBlueprintForAuthoring,
} from '../src/index.ts';
import { kindBodySchema } from '../src/kinds/bodies.ts';
import { withKindBodySchemaForTesting } from '../src/kinds/testing.ts';

function validBlueprint() {
  return {
    formatVersion: 1,
    name: 'Task tracker',
    entities: [
      {
        name: 'task',
        plural: 'tasks',
        fields: [{ name: 'title', kind: 'text' }],
        titleField: 'title',
      },
    ],
    roles: [{ name: 'owner', permissions: { task: ['*'] } }],
  };
}

describe('validateBlueprintForAuthoring', () => {
  it('returns no diagnostics for a fully valid blueprint', () => {
    expect(validateBlueprintForAuthoring(validBlueprint())).toEqual({
      valid: true,
      kind: 'app',
      diagnostics: [],
    });
  });

  it('returns deterministic JSON paths and an actionable hint for structural errors', () => {
    const invalid = { ...validBlueprint(), unexpected: true };
    const first = validateBlueprintForAuthoring(invalid);
    const second = validateBlueprintForAuthoring(invalid);

    expect(first).toEqual(second);
    expect(first.valid).toBe(false);
    expect(first.diagnostics).toContainEqual({
      code: 'unknown-key',
      path: [],
      jsonPath: '$',
      message: expect.stringContaining('Unrecognized key'),
      hint: 'Remove this key or replace it with a property supported by the blueprint schema.',
    });
  });

  it('checks cross references and does not mistake JSON shape validity for blueprint validity', () => {
    const invalid = validBlueprint();
    invalid.entities[0]!.titleField = 'headline';
    const result = validateBlueprintForAuthoring(invalid);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: 'unknown-field',
      path: ['entities', 0, 'titleField'],
      jsonPath: '$["entities"][0]["titleField"]',
      message: 'titleField "headline" is not a field of "task"',
      hint: 'Use the exact field name declared on this entity, or add the field first.',
    });
  });

  it('preserves parseBlueprint and safeParseBlueprint behavior', () => {
    const invalid = validBlueprint();
    invalid.entities[0]!.titleField = 'headline';

    expect(() => parseBlueprint(invalid)).toThrow();
    const parsed = safeParseBlueprint(invalid);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        'titleField "headline" is not a field of "task"'
      );
    }
  });
});

describe('validateBlueprintForAuthoring across kinds', () => {
  // Stand-in body schemas until the deck and page engines wire theirs (bodies.ts).
  const body = z.strictObject({
    title: z.string().min(1),
    sections: z.array(z.strictObject({ heading: z.string().min(1) })).min(1),
  });
  let restore: (() => void)[] = [];
  beforeEach(() => {
    restore = CONTENT_KINDS.map((kind) => withKindBodySchemaForTesting(kind, body));
  });
  afterEach(() => {
    for (const undo of restore) undo();
  });

  function content(
    kind: ContentKind,
    value: unknown = { title: 'Hello', sections: [{ heading: 'One' }] }
  ) {
    return {
      formatVersion: 1,
      kind,
      name: `A ${kind}`,
      description: 'Fictional content.',
      [kind]: value,
    };
  }

  it('accepts a legacy app without kind and an explicit app kind', () => {
    expect(validateBlueprintForAuthoring(validBlueprint())).toEqual({
      valid: true,
      kind: 'app',
      diagnostics: [],
    });
    expect(validateBlueprintForAuthoring({ ...validBlueprint(), kind: 'app' })).toEqual({
      valid: true,
      kind: 'app',
      diagnostics: [],
    });
  });

  it.each(CONTENT_KINDS)('accepts a valid %s', (kind) => {
    expect(validateBlueprintForAuthoring(content(kind))).toEqual({
      valid: true,
      kind,
      diagnostics: [],
    });
  });

  it.each(CONTENT_KINDS)('returns deterministic body paths for an invalid %s', (kind) => {
    const invalid = content(kind, { title: '', sections: [{ heading: 'One' }, { heading: 7 }] });
    const first = validateBlueprintForAuthoring(invalid);
    expect(first).toEqual(validateBlueprintForAuthoring(structuredClone(invalid)));
    expect(first.valid).toBe(false);
    expect(first.kind).toBe(kind);
    expect(first.diagnostics.map((d) => [d.code, d.jsonPath])).toEqual([
      ['value-too-small', `$["${kind}"]["title"]`],
      ['invalid-type', `$["${kind}"]["sections"][1]["heading"]`],
    ]);
    expect(first.diagnostics[1]).toMatchObject({
      path: [kind, 'sections', 1, 'heading'],
      hint: 'Change this value to the type required by the schema at this path.',
    });
  });

  it('asks for the body when a content kind has none', () => {
    const { deck: _deck, ...missing } = content('deck');
    const result = validateBlueprintForAuthoring(missing);
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: 'invalid-type',
      path: ['deck'],
      jsonPath: '$["deck"]',
      message: expect.any(String),
      hint: 'Add the "deck" body: an object with the deck\'s content.',
    });
  });

  it('rejects app keys on a content kind with a kind-specific hint', () => {
    const result = validateBlueprintForAuthoring({ ...content('page'), entities: [], roles: [] });
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    const [diagnostic] = result.diagnostics;
    expect(diagnostic).toMatchObject({ code: 'unknown-key', path: [], jsonPath: '$' });
    expect(diagnostic?.message).toMatch(/entities/);
    expect(diagnostic?.hint).toBe(
      'A page blueprint accepts only $schema, formatVersion, name, description, catalog, tags, icon, category, brand, kind, page. App keys such as entities, roles and screens belong to app blueprints: remove them, or drop "kind" to author an app.'
    );
  });

  it('points at a second body that belongs to another kind', () => {
    const result = validateBlueprintForAuthoring({ ...content('doc'), deck: { title: 'x' } });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unknown-key',
        jsonPath: '$',
        hint: 'A doc blueprint has exactly one body, "doc". Remove "deck", or change "kind" to match it.',
      }),
    ]);
  });

  it('reports an unknown or malformed kind on $.kind without parsing the rest', () => {
    expect(validateBlueprintForAuthoring({ kind: 'spreadsheet', name: 'X' })).toEqual({
      valid: false,
      kind: null,
      diagnostics: [
        {
          code: 'unknown-kind',
          path: ['kind'],
          jsonPath: '$["kind"]',
          message:
            'Blueprint kind "spreadsheet" needs a newer Protoyard (this version supports app, deck, page, doc).',
          hint: 'Update Protoyard, or set "kind" to one this version supports.',
        },
      ],
    });
    expect(validateBlueprintForAuthoring({ ...validBlueprint(), kind: 3 })).toEqual({
      valid: false,
      kind: null,
      diagnostics: [
        {
          code: 'invalid-kind',
          path: ['kind'],
          jsonPath: '$["kind"]',
          message: 'Blueprint "kind" must be a string (one of app, deck, page, doc).',
          hint: 'Set "kind" to app, deck, page or doc, or remove it for an app.',
        },
      ],
    });
  });

  it('keeps app errors unchanged when kind is app', () => {
    const invalid = { ...validBlueprint(), kind: 'app' };
    invalid.entities[0]!.titleField = 'headline';
    expect(validateBlueprintForAuthoring(invalid).diagnostics).toEqual([
      {
        code: 'unknown-field',
        path: ['entities', 0, 'titleField'],
        jsonPath: '$["entities"][0]["titleField"]',
        message: 'titleField "headline" is not a field of "task"',
        hint: 'Use the exact field name declared on this entity, or add the field first.',
      },
    ]);
  });
});

// Kinds whose engine schema is not wired into this build yet (page and doc are).
const UNSHIPPED = CONTENT_KINDS.filter((kind) => !kindBodySchema(kind));

describe('validateBlueprintForAuthoring for kinds this build does not ship', () => {
  it.skipIf(UNSHIPPED.length === 0).each(UNSHIPPED)(
    'reports %s as unavailable on $.kind',
    (kind) => {
      const result = validateBlueprintForAuthoring({ kind, name: 'Later', [kind]: {} });
      expect(result).toEqual({
        valid: false,
        kind,
        diagnostics: [
          {
            code: 'kind-unavailable',
            path: ['kind'],
            jsonPath: '$["kind"]',
            message: `Blueprint kind "${kind}" is not available in this build of Protoyard yet.`,
            hint: `Update Protoyard to a build that ships the ${kind} engine, or author an app blueprint instead.`,
          },
        ],
      });
    }
  );
});
