import { parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';
import { CURRENCIES, CUSTOMER_STATUSES, PLANS } from '../database/schema.ts';

/**
 * Input schemas for every service. Field errors come from core
 * `ValidationError.issues` (path → first message) so dialogs can render them
 * inline; `runService` leaves these errors to the form instead of toasting them.
 */

export { parseInput, ValidationError };
/** Local alias so services keep calling `parse(Schema, input)`. */
export const parse = parseInput;

export const CustomerInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must have at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  company: z.string().trim().max(80, 'Keep it under 80 characters').default(''),
  plan: z.enum(PLANS, 'Pick a plan'),
  status: z.enum(CUSTOMER_STATUSES, 'Pick a status'),
  country: z.string().trim().max(60).default(''),
});
export type CustomerInput = z.input<typeof CustomerInputSchema>;

/** "1,299.5" → 129950. NaN for anything that is not a plain amount with ≤ 2 decimals. */
export function toCents(value: string | number): number {
  const text = typeof value === 'number' ? String(value) : value.trim().replace(/[,\s]/g, '');
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return Number.NaN;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export const OrderInputSchema = z.object({
  customerId: z.string().min(1, 'Pick a customer'),
  description: z.string().trim().min(2, 'Describe the order').max(120),
  // Typed as text or a number; parsed exactly into integer cents (no float math).
  amount: z
    .union([z.string(), z.number()], 'Enter an amount')
    .transform((value) => toCents(value))
    .pipe(
      z
        .number('Enter an amount like 499 or 499.90')
        .positive('Amount must be greater than zero')
        .max(100_000_000, 'Amounts over 1,000,000 need a manual invoice')
    ),
});
export type OrderInput = z.input<typeof OrderInputSchema>;

export const SettingsInputSchema = z.object({
  workspaceName: z.string().trim().min(2, 'Name must have at least 2 characters').max(60),
  supportEmail: z.string().trim().toLowerCase().email('Enter a valid email address'),
  currency: z.enum(CURRENCIES, 'Pick a currency'),
  weeklyReport: z.boolean(),
});
export type SettingsInput = z.input<typeof SettingsInputSchema>;
