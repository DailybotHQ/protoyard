import type { FlowKeepRecord, FlowListState } from './types.ts';

/** Clone list state so a run never mutates the caller's maps. */
export function cloneLists(
  lists: Readonly<Record<string, FlowListState>> | undefined
): Record<string, FlowListState> {
  const out: Record<string, FlowListState> = {};
  if (!lists) return out;
  for (const [id, list] of Object.entries(lists)) {
    out[id] = {
      items: [...list.items],
      used: [...list.used],
      history: list.history.map((row) => [...row]),
    };
  }
  return out;
}

export function cloneRecords(
  records: Readonly<Record<string, readonly FlowKeepRecord[]>> | undefined
): Record<string, FlowKeepRecord[]> {
  const out: Record<string, FlowKeepRecord[]> = {};
  if (!records) return out;
  for (const [id, rows] of Object.entries(records)) {
    out[id] = rows.map((row) => ({
      ...row,
      fields: { ...row.fields },
      history: row.history.map((h) => ({ ...h })),
    }));
  }
  return out;
}

/** Records newest first, optionally filtered by state. */
export function recordsOf(
  records: readonly FlowKeepRecord[],
  { state = null }: { state?: string | null } = {}
): FlowKeepRecord[] {
  return [...records]
    .filter((row) => (state ? row.state === state : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
