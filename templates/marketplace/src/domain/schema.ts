import { z } from 'zod';

export const SellerOnboardingSchema = z.object({
  storeName: z.string().trim().min(2, 'Enter at least 2 characters').max(80),
  bio: z.string().trim().min(10, 'Tell buyers a little about your shop').max(500),
  payoutEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .refine(
      (email) => email.endsWith('@example.com'),
      'Use a fictional @example.com payout address'
    ),
});

export const ListingInputSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(1000),
  category: z.string().trim().min(2).max(40),
  priceCents: z.number().int().min(50).max(1_000_000),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
});

export const ListingUpdateSchema = ListingInputSchema.extend({ id: z.string().min(1) });

export const CheckoutInputSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().min(1).max(20).default(1),
  outcome: z.enum(['success', 'declined']).default('success'),
});

export type SellerOnboardingInput = z.input<typeof SellerOnboardingSchema>;
export type ListingInput = z.input<typeof ListingInputSchema>;
export type ListingUpdate = z.input<typeof ListingUpdateSchema>;
export type CheckoutInput = z.input<typeof CheckoutInputSchema>;
