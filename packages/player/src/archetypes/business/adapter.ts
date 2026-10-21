import type {
  Blueprint,
  BlueprintArchetype,
  BlueprintEntity,
  ScreenNavIcon,
} from '@protoyard/blueprint';

/**
 * Business archetypes in the player (ADR-032): `saas-onboarding` and
 * `analytics`. They keep the blueprint's whole CRUD app and add the kit's
 * screens as extra routes, so the archetype is a destination in the same app,
 * not a replacement for it. This module only reads the validated archetype
 * block; it imports no kit.
 */

export type BusinessArchetype = Extract<
  BlueprintArchetype,
  { id: 'saas-onboarding' | 'analytics' }
>;

export interface AnalyticsFields {
  eventEntity: string;
  metricEntity: string;
  /** A `datetime` or `date` field the dashboard buckets by (`createdAt` without one). */
  dateField: string;
  /** An `enum` field the dashboard breaks events down by, when there is one. */
  typeField: string | null;
  typeValues: readonly string[];
  /** A `money`, `number` or `integer` field the dashboard sums, when there is one. */
  valueField: string | null;
  valueUnit: 'cents' | 'number';
  /** The value field's label for its KPI tile (`Revenue`). */
  valueLabel: string;
  metricNameField: string;
  metricValueField: string | null;
}

export interface BusinessAdapter {
  readonly id: BusinessArchetype['id'];
  /** The kit screen's route (`/onboarding`, `/analytics`). */
  readonly path: string;
  readonly navLabel: string;
  readonly navIcon: ScreenNavIcon;
  /** Present for `analytics`. */
  readonly analytics: AnalyticsFields | null;
  /** Present for `saas-onboarding`: the blueprint entities the kit's workspace and member slots name. */
  readonly saas: { workspaceEntity: string; memberEntity: string } | null;
}

export function isBusinessArchetype(
  blueprint: Blueprint
): blueprint is Blueprint & { archetype: BusinessArchetype } {
  const id = blueprint.archetype?.id;
  return id === 'saas-onboarding' || id === 'analytics';
}

function entity(blueprint: Blueprint, name: string): BlueprintEntity {
  const found = blueprint.entities.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`The archetype names an unknown entity "${name}".`);
  return found;
}

function analyticsFields(
  blueprint: Blueprint,
  slots: { events: string; metrics: string }
): AnalyticsFields {
  const events = entity(blueprint, slots.events);
  const metrics = entity(blueprint, slots.metrics);
  const date =
    events.fields.find((field) => field.kind === 'datetime') ??
    events.fields.find((field) => field.kind === 'date');
  const type = events.fields.find((field) => field.kind === 'enum');
  const value =
    events.fields.find((field) => field.kind === 'money') ??
    events.fields.find((field) => field.kind === 'number' || field.kind === 'integer');
  const metricValue = metrics.fields.find(
    (field) => field.kind === 'number' || field.kind === 'integer' || field.kind === 'money'
  );
  return {
    eventEntity: events.name,
    metricEntity: metrics.name,
    dateField: date?.name ?? 'createdAt',
    typeField: type?.name ?? null,
    typeValues: type && 'values' in type ? type.values : [],
    valueField: value?.name ?? null,
    valueUnit: value?.kind === 'money' ? 'cents' : 'number',
    valueLabel: value
      ? (value.label ?? value.name.charAt(0).toUpperCase() + value.name.slice(1))
      : 'Value',
    metricNameField: metrics.titleField,
    metricValueField: metricValue?.name ?? null,
  };
}

export function createBusinessAdapter(blueprint: Blueprint): BusinessAdapter {
  if (!isBusinessArchetype(blueprint)) {
    throw new Error('The player business adapter needs a saas-onboarding or analytics archetype.');
  }
  const archetype = blueprint.archetype;
  const path = archetype.screens[0].path;
  if (archetype.id === 'analytics') {
    return {
      id: 'analytics',
      path,
      navLabel: 'Analytics',
      navIcon: 'chart-line',
      analytics: analyticsFields(blueprint, archetype.entities),
      saas: null,
    };
  }
  entity(blueprint, archetype.entities.workspaces);
  entity(blueprint, archetype.entities.members);
  return {
    id: 'saas-onboarding',
    path,
    navLabel: 'Get started',
    navIcon: 'zap',
    analytics: null,
    saas: {
      workspaceEntity: archetype.entities.workspaces,
      memberEntity: archetype.entities.members,
    },
  };
}
