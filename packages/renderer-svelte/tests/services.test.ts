import { ValidationError } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { isValidationError, runService } from '../src/services.ts';

describe('runService and the shared ValidationError', () => {
  it('recognizes the core ValidationError and returns it untouched', async () => {
    const error = new ValidationError({ email: 'Enter a valid email address' });
    expect(isValidationError(error)).toBe(true);
    expect(isValidationError(new Error('plain'))).toBe(false);
    const result = await runService(() => {
      throw error;
    });
    expect(result).toEqual({ ok: false, error });
  });
});
