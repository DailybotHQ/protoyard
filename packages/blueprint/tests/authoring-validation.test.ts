import { describe, expect, it } from 'vitest';
import { parseBlueprint, safeParseBlueprint, validateBlueprintForAuthoring } from '../src/index.ts';

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
