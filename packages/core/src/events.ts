/**
 * Domain event envelope. The core understands envelopes only; prototypes
 * register handlers that turn an event into record changes.
 *
 * Idempotency: timeline events carry deterministic ids
 * (`evt:<scenario>:<isoDay>:<n>`). Applied ids are stored in the reserved
 * `py_events` table, so replaying the same window never duplicates data.
 */
export interface DomainEvent<TPayload = unknown> {
  id: string;
  type: string;
  /** ISO instant the event happened in simulated time. */
  at: string;
  actorId?: string;
  payload: TPayload;
  /** `seed` = generated with the world, `timeline` = from time advance, `user` = UI action. */
  source: 'seed' | 'timeline' | 'user';
}

export type EventHandler<TTables = unknown> = (
  event: DomainEvent,
  tables: TTables
) => void | Promise<void>;

export function eventId(scenarioId: string, at: Date, index: number): string {
  return `evt:${scenarioId}:${at.toISOString().slice(0, 10)}:${index}`;
}
