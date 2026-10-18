import { parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';
import {
  COLOR_MODES,
  DEPARTMENTS,
  DIGESTS,
  INVITE_ROLES,
  TEAM_SIZES,
  USE_CASES,
} from '../database/schema.ts';

/**
 * One zod schema per step. Field errors come from core `ValidationError.issues`
 * (path → first message, e.g. `invites.1.email`) so steps render them inline.
 */

export { parseInput, ValidationError };
/** Local alias so services keep calling `parse(Schema, input)`. */
export const parse = parseInput;

export const ProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(60, 'Keep it under 60 characters'),
  jobTitle: z.string().trim().max(60, 'Keep it under 60 characters').default(''),
  department: z.enum(DEPARTMENTS, 'Pick your team'),
  timezone: z.string().min(1, 'Pick your time zone'),
});
export type ProfileInput = z.input<typeof ProfileSchema>;

export const WorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Name your workspace').max(48, 'Keep it under 48 characters'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Use at least 3 characters')
    .max(32, 'Use at most 32 characters')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes'),
  teamSize: z.enum(TEAM_SIZES, 'Pick your team size'),
  useCase: z.enum(USE_CASES, 'Pick what you will use it for'),
});
export type WorkspaceInput = z.input<typeof WorkspaceSchema>;

export const InvitesSchema = z
  .object({
    invites: z
      .array(
        z.object({
          email: z.string().trim().toLowerCase().email('Enter a valid email address'),
          role: z.enum(INVITE_ROLES, 'Pick a role'),
        })
      )
      .min(1, 'Add at least one teammate, or skip this step')
      .max(10, 'Invite up to 10 people at a time'),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.invites.forEach((invite, index) => {
      if (seen.has(invite.email)) {
        ctx.addIssue({
          code: 'custom',
          path: ['invites', index, 'email'],
          message: 'This email is already in the list',
        });
      }
      seen.add(invite.email);
    });
  });
export type InvitesInput = z.input<typeof InvitesSchema>;

export const PreferencesSchema = z.object({
  mode: z.enum(COLOR_MODES, 'Pick a color mode'),
  digest: z.enum(DIGESTS, 'Pick how often to get a digest'),
  productUpdates: z.boolean(),
  mentions: z.boolean(),
});
export type PreferencesInput = z.input<typeof PreferencesSchema>;

/** Suggests a URL handle from a workspace name: "Acme Cloud!" → "acme-cloud". */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}
