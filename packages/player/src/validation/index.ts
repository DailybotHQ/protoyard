import type { Blueprint } from '@protoyard/blueprint';
import { mount, unmount } from 'svelte';
import {
  createValidationSession,
  hashRoute,
  type RouteSource,
  type SessionRuntime,
} from './session.ts';
import { downloadMetrics, metricsFile, openValidationStore } from './store.ts';
import ValidationPanel from './ValidationPanel.svelte';

/**
 * Mounts the validation panel for a blueprint with `validation.tasks`. The
 * player imports this module only for such blueprints, so others download
 * none of it.
 */

export interface MountValidationOptions {
  blueprint: Blueprint;
  namespace: string;
  runtime: SessionRuntime;
  /** Where the panel mounts (defaults to a new element in `document.body`). */
  target?: HTMLElement;
  route?: RouteSource;
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
  download?: typeof downloadMetrics;
}

export interface MountedValidation {
  destroy(): Promise<void>;
}

export function hasValidationTasks(blueprint: Blueprint): boolean {
  return (blueprint.validation?.tasks.length ?? 0) > 0;
}

export function mountValidationPanel(options: MountValidationOptions): MountedValidation {
  const { blueprint, namespace } = options;
  const store = openValidationStore(namespace, {
    ...(options.indexedDB ? { indexedDB: options.indexedDB } : {}),
    ...(options.IDBKeyRange ? { IDBKeyRange: options.IDBKeyRange } : {}),
  });
  const session = createValidationSession({
    blueprint,
    runtime: options.runtime,
    route: options.route ?? hashRoute(window),
    record: (attempt) => store.record(attempt),
  });
  const ownTarget = options.target
    ? null
    : document.body.appendChild(document.createElement('div'));
  const target = options.target ?? (ownTarget as HTMLElement);
  const download = options.download ?? downloadMetrics;
  const panel = mount(ValidationPanel, {
    target,
    props: {
      session,
      onDownload: async () => {
        const file = metricsFile({
          name: blueprint.name,
          namespace,
          tasks: blueprint.validation?.tasks ?? [],
          attempts: await store.list(),
        });
        download(file);
      },
    },
  });
  return {
    async destroy() {
      await unmount(panel);
      session.close();
      store.close();
      ownTarget?.remove();
    },
  };
}

export {
  type AttemptOutcome,
  createValidationSession,
  hashRoute,
  type RouteSource,
  type SessionState,
  type ValidationAttempt,
  type ValidationSession,
} from './session.ts';
export {
  assertAttempt,
  downloadMetrics,
  metricsFile,
  openValidationStore,
  VALIDATION_METRICS_FORMAT,
  VALIDATION_METRICS_VERSION,
  type ValidationMetricsFile,
  type ValidationStore,
  validationDatabaseName,
} from './store.ts';
