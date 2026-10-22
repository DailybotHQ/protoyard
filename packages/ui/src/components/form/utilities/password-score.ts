/**
 * Password strength scoring for PasswordStrengthMeter.
 *
 * Simulation only: rates the supplied text in memory. Never stores, hashes or
 * transmits the value. Common-password checks use a tiny fictional list.
 */

export const PASSWORD_RULES = [
  { key: 'min', message: 'Use at least 12 characters', test: (p: string) => p.length >= 12 },
  { key: 'uppercase', message: 'Add an uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lowercase', message: 'Add a lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  {
    key: 'symbols',
    message: 'Add a symbol',
    test: (p: string) => /[`~!@#$%^&*()\-_=+[\]{}\\|;:'",.<>/?]/.test(p),
  },
  { key: 'digits', message: 'Add a number', test: (p: string) => /\d/.test(p) },
  {
    key: 'oneOf',
    message: 'Avoid a common password',
    test: (p: string) => !COMMON_PASSWORDS.has(p),
  },
] as const;

/** Fictional demo passwords only — not a real breach corpus. */
const COMMON_PASSWORDS = new Set(['Passw0rd', 'Password123', 'password', '12345678']);

export type PasswordFeedbackKey = (typeof PASSWORD_RULES)[number]['key'];

export type PasswordScoreResult = {
  score: number;
  failed: PasswordFeedbackKey[];
  messages: string[];
};

/** Score 0–5 (five minus failed rules; empty password scores 0). */
export function passwordScore(password: string): PasswordScoreResult {
  if (!password) return { score: 0, failed: [], messages: [] };
  const failed = PASSWORD_RULES.filter((rule) => !rule.test(password));
  return {
    score: Math.max(0, 5 - failed.length),
    failed: failed.map((rule) => rule.key),
    messages: failed.map((rule) => rule.message),
  };
}

export const PASSWORD_SCORE_WORDS = [
  'None',
  'Very weak',
  'Weak',
  'Medium',
  'Good',
  'Strong',
] as const;

export const PASSWORD_SCORE_LEVELS = [
  '',
  'guessable',
  'weak',
  'medium',
  'unguessable',
  'strong',
] as const;
