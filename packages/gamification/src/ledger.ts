import { type PointsEntry, type PointsEntryInput, PointsEntrySchema } from './schemas.ts';

/**
 * Append a validated ledger entry. Does not mutate the input array.
 * Throws a zod error when the entry is invalid.
 */
export function appendPointsEntry(
  entries: readonly PointsEntry[],
  input: PointsEntryInput
): PointsEntry[] {
  const entry = PointsEntrySchema.parse(input);
  if (entries.some((row) => row.id === entry.id)) {
    throw new Error(`points entry "${entry.id}" already exists`);
  }
  return [...entries, entry];
}

/**
 * Mark every live entry for a source as reverted. Idempotent. Returns a new
 * array; originals are not mutated.
 */
export function revertPointsBySource(
  entries: readonly PointsEntry[],
  sourceKind: string,
  sourceId: string
): PointsEntry[] {
  return entries.map((entry) => {
    if (entry.sourceKind !== sourceKind || entry.sourceId !== sourceId || entry.reverted) {
      return entry;
    }
    return { ...entry, reverted: true };
  });
}

/**
 * Confirm a provisional entry (same id): clears `provisional`. Missing or
 * already verified/reverted ids throw.
 */
export function confirmProvisionalEntry(
  entries: readonly PointsEntry[],
  entryId: string
): PointsEntry[] {
  let found = false;
  const next = entries.map((entry) => {
    if (entry.id !== entryId) return entry;
    found = true;
    if (entry.reverted) throw new Error(`points entry "${entryId}" is reverted`);
    if (!entry.provisional) throw new Error(`points entry "${entryId}" is not provisional`);
    return { ...entry, provisional: false };
  });
  if (!found) throw new Error(`points entry "${entryId}" not found`);
  return next;
}
