import {
  type AnyBlueprint,
  type BlueprintKind,
  detectBlueprintKind,
  loadUntrustedDocument,
} from '@protoyard/blueprint';

export const MAX_PASTED_BLUEPRINT_BYTES = 256 * 1024;

const KIND_LABELS: Record<BlueprintKind, string> = {
  app: 'App',
  deck: 'Deck',
  page: 'Page',
  doc: 'Document',
};

/** Applies the paste cap before parsing, then validates against the matching kind schema. */
export async function parsePastedBlueprint(source: string): Promise<AnyBlueprint> {
  const bytes = new TextEncoder().encode(source).byteLength;
  if (bytes > MAX_PASTED_BLUEPRINT_BYTES) {
    throw new Error(
      `This paste is larger than ${MAX_PASTED_BLUEPRINT_BYTES} bytes. Open a smaller blueprint file.`
    );
  }

  let kind: BlueprintKind | null = null;
  try {
    const detection = detectBlueprintKind(JSON.parse(source) as unknown);
    if (detection.ok) kind = detection.kind;
  } catch {
    // The untrusted loader below returns the user-facing JSON issue.
  }

  const result = await loadUntrustedDocument(source, { maxBytes: MAX_PASTED_BLUEPRINT_BYTES });
  if (!result.success) {
    const label = kind
      ? `${KIND_LABELS[kind]} blueprint validation failed`
      : 'Blueprint validation failed';
    throw new Error(`${label}: ${result.issues.map((issue) => issue.message).join(' ')}`);
  }
  return result.blueprint;
}
