import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { type Appointment, database } from './database/schema.ts';
import { policy } from './domain/policy.ts';
import {
  type AppointmentEndedPayload,
  CLINIC_GENERATOR_VERSION,
  clinicTimeline,
  generateClinicWorld,
} from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/**
 * Wires protoyard.json to the clinic's schema, policy, scenarios, generator
 * and timeline. Read this file first: schema → policy → scenarios →
 * generator → services (src/domain/services.ts) → screens.
 */
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate: generateClinicWorld,
  generatorVersion: CLINIC_GENERATOR_VERSION,
  timeline: clinicTimeline,
  // Advancing simulated time ends appointments: checked-in visits complete, scheduled ones
  // complete or no-show (cancelled ones, and anything already resolved, are skipped).
  applyEvent: async (event, ctx) => {
    if (event.type !== 'appointment.ended') return;
    const { appointmentId, outcome } = event.payload as AppointmentEndedPayload;
    const a = (await ctx.get('appointments', appointmentId)) as Appointment | undefined;
    if (!a || a.end !== event.at) return;
    if (a.status === 'checked-in') {
      await ctx.put('appointments', { ...a, status: 'completed', updatedAt: event.at });
    } else if (a.status === 'scheduled') {
      await ctx.put('appointments', {
        ...a,
        status: outcome,
        checkedInAt: outcome === 'completed' ? a.start : null,
        updatedAt: event.at,
      });
    }
  },
  integrity: {
    relations: {
      availability: { providerId: 'providers' },
      appointments: { patientId: 'patients', providerId: 'providers', createdBy: 'py_personas' },
      notes: {
        appointmentId: 'appointments',
        patientId: 'patients',
        providerId: 'providers',
        authorId: 'py_personas',
      },
      audit: { patientId: 'patients', actorId: 'py_personas' },
    },
    timestamps: {
      patients: ['createdAt', 'updatedAt'],
      appointments: ['createdAt', 'updatedAt'],
      notes: ['createdAt', 'updatedAt'],
      audit: ['at'],
    },
  },
});
