import { ThemeSchema, ThemeStyleSchema } from '@protoyard/core';
import { FONT_CATALOG } from './fonts.ts';
import { NEUTRAL_FAMILIES } from './palette.ts';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Maximum encoded theme definition accepted in a share link. */
export const MAX_THEME_SHARE_LENGTH = 1024;

const shareId = ThemeSchema.shape.id;
const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * C0/C1 controls, bidi embedding/override/isolate controls and line or
 * paragraph separators: a shared name is single-line text and must not
 * disguise itself (the same set the review-comment schema refuses in names).
 */
function isUnsafeNameChar(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0x2028 ||
    code === 0x2029
  );
}

/** Strips unsafe characters from a share-link theme name; the result must still be 1–40 chars. */
export function cleanThemeShareName(name: string): string {
  let out = '';
  for (const char of name) if (!isUnsafeNameChar(char.charCodeAt(0))) out += char;
  return out.trim();
}

/** Cleans `name` on untrusted input before the strict schema checks it. */
function withCleanName(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const name = (input as { name?: unknown }).name;
  return typeof name === 'string' ? { ...input, name: cleanThemeShareName(name) } : input;
}

const ThemeShareDefinitionSchema = ThemeSchema.pick({ name: true })
  .extend({
    seed: ThemeSchema.shape.light.shape.primary.refine((value) => hexColor.test(value)),
    secondary: ThemeSchema.shape.light.shape.secondary
      .refine((value) => hexColor.test(value))
      .optional(),
    neutral: shareId.refine((value) => NEUTRAL_FAMILIES.some((family) => family === value)),
    font: shareId.refine((value) => FONT_CATALOG.some(({ id }) => id === value)),
    radius: shareId.refine((value) =>
      ['square', 'sharp', 'default', 'round', 'pill'].includes(value)
    ),
    elevation: ThemeStyleSchema.shape.elevation,
    motion: shareId.refine((value) => ['none', 'subtle', 'standard', 'expressive'].includes(value)),
    surface: ThemeStyleSchema.shape.surface,
    focusRing: shareId.refine((value) => ['ring', 'outline', 'glow', 'inset'].includes(value)),
    density: ThemeSchema.shape.density,
  })
  .strict();

export type ThemeShareDefinition = {
  name: string;
  seed: string;
  secondary?: string;
  neutral: (typeof NEUTRAL_FAMILIES)[number];
  font: string;
  radius: 'square' | 'sharp' | 'default' | 'round' | 'pill';
  elevation: 'flat' | 'soft' | 'crisp' | 'glow' | 'layered';
  motion: 'none' | 'subtle' | 'standard' | 'expressive';
  surface: 'solid' | 'glass';
  focusRing: 'ring' | 'outline' | 'glow' | 'inset';
  density: number;
};

/** Encodes only the Theme Studio inputs, never generated palette tokens. */
export function encodeThemeShare(definition: ThemeShareDefinition): string {
  const parsed = ThemeShareDefinitionSchema.parse(withCleanName(definition));
  const bytes = new TextEncoder().encode(JSON.stringify(parsed));
  const encoded = encodeBase64Url(bytes);
  if (encoded.length > MAX_THEME_SHARE_LENGTH) {
    throw new RangeError(`Theme share definition exceeds ${MAX_THEME_SHARE_LENGTH} characters.`);
  }
  return encoded;
}

/** Decodes an untrusted, size-capped Theme Studio share definition. */
export function decodeThemeShare(value: string): ThemeShareDefinition {
  if (!value || value.length > MAX_THEME_SHARE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new TypeError('Invalid or oversized theme share definition.');
  }
  const bytes = decodeBase64Url(value);
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new TypeError('Theme share definition is not valid JSON.');
  }
  return ThemeShareDefinitionSchema.parse(withCleanName(input)) as ThemeShareDefinition;
}

/** Looks for the share parameter in a normal query or the hash-router query. */
export function getThemeShareValue(search: string, hash: string): string | null {
  const fromSearch = new URLSearchParams(search).get('themeDef');
  if (fromSearch) return fromSearch;
  const queryIndex = hash.indexOf('?');
  return queryIndex < 0 ? null : new URLSearchParams(hash.slice(queryIndex + 1)).get('themeDef');
}

function encodeBase64Url(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] as number;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += alphabet[first >> 2];
    output += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) output += alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    if (third !== undefined) output += alphabet[third & 63];
  }
  return output;
}

function decodeBase64Url(value: string): Uint8Array {
  if (value.length % 4 === 1) throw new TypeError('Malformed base64url theme share definition.');
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new TypeError('Malformed base64url theme share definition.');
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 255);
    }
  }
  const bytes = new Uint8Array(output);
  if (encodeBase64Url(bytes) !== value)
    throw new TypeError('Malformed base64url theme share definition.');
  return bytes;
}
