import { loadUntrustedBlueprint } from '@protoyard/blueprint';

export const MAX_PASTED_BLUEPRINT_BYTES = 256 * 1024;

/** Applies the paste cap before parsing, then validates against the blueprint schema. */
export function parsePastedBlueprint(source: string) {
  const bytes = new TextEncoder().encode(source).byteLength;
  if (bytes > MAX_PASTED_BLUEPRINT_BYTES) {
    throw new Error(
      `This paste is larger than ${MAX_PASTED_BLUEPRINT_BYTES} bytes. Open a smaller blueprint file.`
    );
  }
  const result = loadUntrustedBlueprint(source, { maxBytes: MAX_PASTED_BLUEPRINT_BYTES });
  if (!result.success) {
    throw new Error(result.issues.map((issue) => issue.message).join(' '));
  }
  return result.blueprint;
}
