/**
 * Neutral email helpers for TagEmailInput.
 *
 * Validation is format-only (local@domain). It does not contact a network,
 * look up MX records or claim deliverability.
 */

/** Simple RFC-inspired address shape: non-empty local and domain labels. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailAddress(text: string): boolean {
  return EMAIL_PATTERN.test(text.trim());
}

/** Split a paste or typed list on commas, semicolons, spaces and newlines. */
export function splitTagTokens(raw: string): string[] {
  return raw
    .split(/[,;\s\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
