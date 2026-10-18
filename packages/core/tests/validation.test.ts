import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseInput, ValidationError } from '../src/index.ts';

const ContactSchema = z.object({
  name: z.string().trim().min(2, 'Name must have at least 2 characters'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  tags: z.array(z.string()).default([]),
});

function rejection(schema: z.ZodType, input: unknown): ValidationError {
  try {
    parseInput(schema, input);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return error as ValidationError;
  }
  throw new Error('parseInput accepted invalid input');
}

describe('parseInput', () => {
  it('returns the transformed output for valid input', () => {
    const value = parseInput(ContactSchema, { name: '  Ada  ', email: ' ADA@Example.com ' });
    expect(value).toEqual({ name: 'Ada', email: 'ada@example.com', tags: [] });
  });

  it('throws a ValidationError keyed by field with the first issue as message', () => {
    const error = rejection(ContactSchema, { name: 'A', email: 'nope' });
    expect(error.name).toBe('ValidationError');
    expect(error.issues).toEqual({
      name: 'Name must have at least 2 characters',
      email: 'Enter a valid email address',
    });
    expect(error.message).toBe('Name must have at least 2 characters');
  });

  it('keys nested issues by joined path and keeps only the first message per path', () => {
    const InvitesSchema = z.object({
      invites: z.array(
        z.object({ email: z.string().email('Enter a valid email address').min(20, 'Too short') })
      ),
    });
    const error = rejection(InvitesSchema, {
      invites: [{ email: 'teammate.one@example.com' }, { email: 'x' }],
    });
    expect(error.issues).toEqual({ 'invites.1.email': 'Enter a valid email address' });
  });

  it('uses "form" for root-level issues', () => {
    const Schema = z
      .object({ password: z.string(), confirm: z.string() })
      .refine((value) => value.password === value.confirm, 'Passwords do not match');
    expect(rejection(Schema, { password: 'a', confirm: 'b' }).issues).toEqual({
      form: 'Passwords do not match',
    });
    expect(rejection(z.string('Expected text'), 42).issues).toEqual({ form: 'Expected text' });
  });
});

describe('ValidationError', () => {
  it('falls back to a generic message without issues', () => {
    const error = new ValidationError({});
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Invalid input');
    expect(error.issues).toEqual({});
  });
});
