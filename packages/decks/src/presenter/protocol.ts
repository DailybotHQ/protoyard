/**
 * Presenter sync protocol (ADR-038). Messages are untrusted input: validate
 * with zod, never eval, and never carry more than position fields.
 *
 * Payload shape: `{ type, slideId, step }` only. Channel name scopes the deck
 * namespace so foreign decks do not collide.
 */
import { z } from 'zod';

/** Message kinds on the presenter channel. */
export const PRESENTER_MESSAGE_TYPES = ['hello', 'sync', 'request'] as const;
export type PresenterMessageType = (typeof PRESENTER_MESSAGE_TYPES)[number];

const SLIDE_ID = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'slideId must be a lowercase slug');

/**
 * Only these three fields. Extra keys fail (strictObject).
 * - `hello` — peer announcing presence
 * - `sync` — authoritative position from the main deck or presenter
 * - `request` — peer asks for a fresh sync (slideId/step may be last known)
 */
export const PresenterMessageSchema = z.strictObject({
  type: z.enum(PRESENTER_MESSAGE_TYPES),
  slideId: SLIDE_ID,
  step: z.number().int().min(0).max(32),
});

export type PresenterMessage = z.infer<typeof PresenterMessageSchema>;

/** Channel name for one deck namespace (same origin BroadcastChannel). */
export function presenterChannelName(namespace: string): string {
  const ns = sanitizeNamespace(namespace);
  return `protoyard.deck.presenter.v1:${ns}`;
}

export function sanitizeNamespace(namespace: string): string {
  const raw = typeof namespace === 'string' ? namespace.trim() : '';
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return cleaned || 'default';
}

/**
 * Parse an untrusted channel payload. Returns null when the message is
 * malformed or fails the schema (never throws).
 */
export function parsePresenterMessage(raw: unknown): PresenterMessage | null {
  const result = PresenterMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Build a protocol message (throws only if the caller passes invalid data). */
export function presenterMessage(
  type: PresenterMessageType,
  slideId: string,
  step: number
): PresenterMessage {
  return PresenterMessageSchema.parse({ type, slideId, step });
}
