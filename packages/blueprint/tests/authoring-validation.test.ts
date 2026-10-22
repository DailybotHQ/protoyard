import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { safeParseBlock, safeParseBlocks } from '../../blocks/src/schema/index.ts';
import {
  blockOrAssetHint,
  CONTENT_KINDS,
  type ContentKind,
  diagnosticCode,
  diagnosticsFromBlockIssues,
  parseBlueprint,
  safeParseBlueprint,
  validateBlueprintForAuthoring,
} from '../src/index.ts';
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

describe('validateBlueprintForAuthoring for kinds this build does not ship', () => {
  it.each(CONTENT_KINDS)('reports %s as unavailable on $.kind', (kind) => {
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
  });
});

describe('block and asset authoring hints', () => {
  function fromBlock(input: unknown, prefix: (string | number)[] = ['deck', 'blocks']) {
    const parsed = safeParseBlock(input);
    expect(parsed.success).toBe(false);
    return diagnosticsFromBlockIssues(parsed.issues, prefix);
  }

  it('maps an unknown block type to a stable code and path-addressed hint', () => {
    const diagnostics = fromBlock({ type: 'script', code: 'alert(1)' });
    expect(diagnostics).toEqual([
      {
        code: 'unknown-block-type',
        path: ['deck', 'blocks', 'type'],
        jsonPath: '$["deck"]["blocks"]["type"]',
        message: expect.stringMatching(/Invalid discriminator/i),
        hint: blockOrAssetHint('unknown-block-type', ''),
      },
    ]);
    expect(diagnostics[0]?.hint).toMatch(/supported block type/i);
  });

  it('maps missing image alt text without fetching anything', () => {
    const diagnostics = fromBlock({
      type: 'image',
      src: 'assets/cover.png',
      width: 1,
      height: 1,
    });
    expect(diagnostics).toContainEqual({
      code: 'missing-alt-text',
      path: ['deck', 'blocks', 'alt'],
      jsonPath: '$["deck"]["blocks"]["alt"]',
      message: 'Describe the image in alt, or mark it decorative: true',
      hint: expect.stringMatching(/alt description|decorative/i),
    });
  });

  it('maps remote and script media sources as unsupported URL schemes', () => {
    const remote = fromBlock({
      type: 'image',
      src: 'https://evil.example/x.png',
      alt: 'x',
      width: 1,
      height: 1,
    });
    expect(remote[0]).toMatchObject({
      code: 'unsupported-url-scheme',
      path: ['deck', 'blocks', 'src'],
      jsonPath: '$["deck"]["blocks"]["src"]',
    });
    expect(remote[0]?.hint).toMatch(/Remote media|javascript/i);
    expect(remote[0]?.hint).toMatch(/nothing is fetched/i);

    const link = fromBlock({
      type: 'cta',
      title: 'Go',
      actions: [{ label: 'Open', href: 'javascript:alert(1)' }],
    });
    expect(link).toContainEqual(
      expect.objectContaining({
        code: 'unsupported-url-scheme',
        path: ['deck', 'blocks', 'actions', 0, 'href'],
        message: 'Use an http(s), mailto, #anchor or relative link',
      })
    );
  });

  it('maps invalid chart specs with a chart-specific hint', () => {
    const diagnostics = fromBlock({
      type: 'chart',
      spec: {
        kind: 'donut',
        title: 'Share',
        labels: ['a'],
        series: [{ label: 's', values: [1, 2] }],
      },
    });
    expect(diagnostics).toContainEqual({
      code: 'invalid-chart-spec',
      path: ['deck', 'blocks', 'spec', 'series', 0, 'values'],
      jsonPath: '$["deck"]["blocks"]["spec"]["series"][0]["values"]',
      message: 'Needs one value per label (1)',
      hint: expect.stringMatching(/chart spec|one value per label/i),
    });
  });

  it('maps invalid step or fragment targets and duplicate block ids', () => {
    expect(diagnosticCode('custom', 'No such step "intro"', ['fragment', 'target'])).toBe(
      'invalid-step-or-fragment-target'
    );
    expect(diagnosticCode('custom', 'unknown fragment target #gone', ['href'])).toBe(
      'invalid-step-or-fragment-target'
    );
    expect(blockOrAssetHint('invalid-step-or-fragment-target', '')).toMatch(/block id|step index/i);

    const blocks = safeParseBlocks([
      { type: 'text', id: 'same', markdown: 'one' },
      { type: 'text', id: 'same', markdown: 'two' },
    ]);
    expect(blocks.success).toBe(false);
    const diagnostics = diagnosticsFromBlockIssues(blocks.issues, ['page', 'body']);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'duplicate-block-id',
        path: ['page', 'body', 1, 'id'],
        hint: expect.stringMatching(/unique id/i),
      })
    );
  });

  it('produces deterministic diagnostics and never touches the network', () => {
    const fetchImpl = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const input = {
        type: 'image',
        src: 'https://cdn.example/a.png',
        alt: 'x',
        width: 10,
        height: 10,
      };
      const first = fromBlock(input, ['doc', 'sections', 0, 'blocks', 2]);
      const second = fromBlock(structuredClone(input), ['doc', 'sections', 0, 'blocks', 2]);
      expect(first).toEqual(second);
      expect(first[0]?.jsonPath).toBe('$["doc"]["sections"][0]["blocks"][2]["src"]');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = fetchImpl;
    }
  });

  it('keeps path prefixes when mapping a list of block issues into a deck body', () => {
    const restore = withKindBodySchemaForTesting(
      'deck',
      z.strictObject({
        title: z.string().min(1),
        blocks: z.array(z.unknown()),
      })
    );
    try {
      // Body shape is valid; block mapping is separate and path-prefixed for authors.
      const envelope = validateBlueprintForAuthoring({
        formatVersion: 1,
        kind: 'deck',
        name: 'Pitch',
        description: 'Fictional.',
        deck: { title: 'Hello', blocks: [] },
      });
      expect(envelope.valid).toBe(true);

      const mapped = diagnosticsFromBlockIssues(
        [
          {
            path: [0, 'type'],
            message: "Invalid discriminator value. Expected 'heading' | 'text' | 'image' | 'chart'",
          },
        ],
        ['deck', 'blocks']
      );
      expect(mapped[0]).toEqual({
        code: 'unknown-block-type',
        path: ['deck', 'blocks', 0, 'type'],
        jsonPath: '$["deck"]["blocks"][0]["type"]',
        message: expect.stringContaining('Invalid discriminator'),
        hint: expect.stringMatching(/supported block type/i),
      });
    } finally {
      restore();
    }
  });
});
