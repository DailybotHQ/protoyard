import { Dexie, type Table } from 'dexie';
import type { ValidationAttempt } from './session.ts';

/**
 * Validation metrics, stored per blueprint in the browser
 * (`protoyard.<namespace>.validation`), next to the blueprint's data and
 * control databases and never sent anywhere. They can be downloaded as a
 * `protoyard-validation-metrics` v1 file for `protoyard quick report`.
 */

export const VALIDATION_METRICS_FORMAT = 'protoyard-validation-metrics';
export const VALIDATION_METRICS_VERSION = 1;

export function validationDatabaseName(namespace: string): string {
  return `protoyard.${namespace}.validation`;
}

export interface ValidationMetricsFile {
  format: typeof VALIDATION_METRICS_FORMAT;
  version: typeof VALIDATION_METRICS_VERSION;
  blueprint: { name: string; namespace: string };
  exportedAt: string;
  tasks: { id: string; prompt: string }[];
  attempts: ValidationAttempt[];
}

const TASK_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const OUTCOMES = new Set(['success', 'gave-up', 'timed-out']);
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const isInstant = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** Checks an attempt before it is stored (the player has no schema library). */
export function assertAttempt(value: ValidationAttempt): ValidationAttempt {
  const ok =
    typeof value.taskId === 'string' &&
    value.taskId.length <= 48 &&
    TASK_ID.test(value.taskId) &&
    OUTCOMES.has(value.outcome) &&
    isCount(value.durationMs) &&
    isCount(value.steps) &&
    isInstant(value.startedAt) &&
    isInstant(value.endedAt);
  if (!ok) throw new TypeError('Invalid validation attempt.');
  const { taskId, outcome, durationMs, steps, startedAt, endedAt } = value;
  return { taskId, outcome, durationMs, steps, startedAt, endedAt };
}

interface AttemptRow extends ValidationAttempt {
  id?: number;
}

class ValidationDatabase extends Dexie {
  attempts!: Table<AttemptRow, number>;
  constructor(name: string, options?: ConstructorParameters<typeof Dexie>[1]) {
    super(name, options);
    this.version(1).stores({ attempts: '++id, taskId, startedAt' });
  }
}

export interface ValidationStore {
  record(attempt: ValidationAttempt): Promise<void>;
  list(): Promise<ValidationAttempt[]>;
  clear(): Promise<void>;
  close(): void;
}

export function openValidationStore(
  namespace: string,
  options: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange } = {}
): ValidationStore {
  const db = new ValidationDatabase(validationDatabaseName(namespace), {
    ...(options.indexedDB ? { indexedDB: options.indexedDB } : {}),
    ...(options.IDBKeyRange ? { IDBKeyRange: options.IDBKeyRange } : {}),
  });
  return {
    async record(attempt) {
      await db.attempts.add(assertAttempt(attempt));
    },
    async list() {
      const rows = await db.attempts.orderBy('id').toArray();
      return rows.map(({ id: _id, ...attempt }) => attempt);
    },
    clear: async () => {
      await db.attempts.clear();
    },
    close: () => db.close(),
  };
}

/** The download file: tasks and attempts, nothing else from the prototype. */
export function metricsFile(input: {
  name: string;
  namespace: string;
  tasks: readonly { id: string; prompt: string }[];
  attempts: readonly ValidationAttempt[];
  now?: () => Date;
}): ValidationMetricsFile {
  return {
    format: VALIDATION_METRICS_FORMAT,
    version: VALIDATION_METRICS_VERSION,
    blueprint: { name: input.name, namespace: input.namespace },
    exportedAt: (input.now ?? (() => new Date()))().toISOString(),
    tasks: input.tasks.map(({ id, prompt }) => ({ id, prompt })),
    attempts: input.attempts.map(assertAttempt),
  };
}

/** Saves the metrics file through the browser's download, with no upload. */
export function downloadMetrics(file: ValidationMetricsFile, doc: Document = document): string {
  const name = `${file.blueprint.namespace}-validation-metrics.json`;
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: 'application/json' })
  );
  const link = doc.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return name;
}
