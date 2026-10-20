import { type PrototypeRuntime, parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';
import type { Alert, Incident, MonitoringDatabase } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

const AlertIdInput = z.object({ alertId: z.string().trim().min(1).max(120) });

export function createMonitoringServices(runtime: PrototypeRuntime<MonitoringDatabase>) {
  const { db, session, environment, clock } = runtime;
  return {
    async acknowledgeAlert(input: { alertId: string }): Promise<void> {
      session.assert(CAPABILITIES.acknowledge);
      const { alertId } = parseInput(AlertIdInput, input);
      await environment.run('alerts.acknowledge', () =>
        db.transaction('rw', db.alerts, db.incidents, async () => {
          const alert = await db.alerts.get(alertId);
          if (alert?.status !== 'open') {
            throw new ValidationError({ alertId: 'Only open alerts can be acknowledged.' });
          }
          const at = clock.now().toISOString();
          await db.alerts.update(alert.id, { status: 'acknowledged', acknowledgedAt: at });
          const incident = await db.incidents.get(`incident:${alert.deviceId}`);
          if (incident && incident.status === 'investigating') {
            await db.incidents.update(incident.id, { status: 'monitoring', updatedAt: at });
          }
        })
      );
    },
    async resolveAlert(input: { alertId: string }): Promise<void> {
      session.assert(CAPABILITIES.resolve);
      const { alertId } = parseInput(AlertIdInput, input);
      await environment.run('alerts.resolve', () =>
        db.transaction('rw', db.alerts, db.incidents, async () => {
          const alert: Alert | undefined = await db.alerts.get(alertId);
          if (!alert || alert.status === 'resolved') {
            throw new ValidationError({ alertId: 'This alert is not active.' });
          }
          const at = clock.now().toISOString();
          await db.alerts.update(alert.id, { status: 'resolved', resolvedAt: at });
          const incident: Incident | undefined = await db.incidents.get(
            `incident:${alert.deviceId}`
          );
          if (incident && incident.activeAlertId === alert.id) {
            await db.incidents.update(incident.id, {
              status: 'resolved',
              updatedAt: at,
              normalSamples: 2,
              activeAlertId: null,
            });
          }
        })
      );
    },
  };
}
