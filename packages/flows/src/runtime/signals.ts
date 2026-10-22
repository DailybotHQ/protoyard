import type { Signal, SignalKind } from './types.ts';

export function openSignals(signals: readonly Signal[], flowId?: string): Signal[] {
  return signals.filter((signal) => !signal.resolved && (!flowId || signal.flowId === flowId));
}

/** Open signals for attention UI: failures first, then approvals, blockers, waits. */
export function attentionOf(signals: readonly Signal[], flowId?: string): Signal[] {
  const order: Record<SignalKind, number> = {
    failed: 0,
    approval: 1,
    blocker: 2,
    waiting: 3,
  };
  return openSignals(signals, flowId).sort(
    (a, b) => order[a.kind] - order[b.kind] || b.at.localeCompare(a.at) || b.id.localeCompare(a.id)
  );
}
