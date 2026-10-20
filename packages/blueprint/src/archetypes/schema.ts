import { ActivityLevelSchema, DataDensitySchema } from '@protoyard/core';
import { z } from 'zod';

/** Kit entry points understood by the player. This list is data; it never imports a kit. */
export const ARCHETYPE_KIT_ENTRY_POINTS = [
  '@protoyard/ai',
  '@protoyard/ai-ui',
  '@protoyard/saas',
  '@protoyard/saas-ui',
  '@protoyard/analytics',
  '@protoyard/analytics-ui/grid',
  '@protoyard/analytics-ui/date-range',
] as const;

export type ArchetypeKitEntryPoint = (typeof ARCHETYPE_KIT_ENTRY_POINTS)[number];
export const ARCHETYPE_IDS = ['assistant', 'team-chat', 'saas-onboarding', 'analytics'] as const;

const ArchetypeEntitySlotsSchema = z.strictObject({
  conversations: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  messages: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
});

const TeamChatEntitySlotsSchema = z.strictObject({
  rooms: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  messages: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  members: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
});

const SaasEntitySlotsSchema = z.strictObject({
  workspaces: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  members: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
});

const AnalyticsEntitySlotsSchema = z.strictObject({
  events: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  metrics: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
});

const ScreenRouteSchema = z
  .string()
  .regex(/^\/[a-z0-9/:-]*$/, { message: 'screen path must be a hash route such as "/assistant"' });

const ScenarioDefaultsSchema = z.strictObject({
  density: DataDensitySchema.default('normal'),
  activity: ActivityLevelSchema.default('normal'),
});

const screen = <T extends string>(kind: T) =>
  z.strictObject({ kind: z.literal(kind), path: ScreenRouteSchema });

/**
 * Portable runtime configuration for one of the player's kit-backed product
 * archetypes. Package identifiers are an allow-list, never module specifiers
 * resolved from arbitrary blueprint text.
 */
export const ArchetypeSchema = z.discriminatedUnion('id', [
  z.strictObject({
    id: z.literal('assistant'),
    kits: z.tuple([z.literal('@protoyard/ai'), z.literal('@protoyard/ai-ui')]),
    entities: ArchetypeEntitySlotsSchema,
    screens: z.tuple([screen('assistant-workspace')]),
    scenarioDefaults: ScenarioDefaultsSchema.default({ density: 'normal', activity: 'normal' }),
  }),
  z.strictObject({
    id: z.literal('team-chat'),
    kits: z.tuple([z.literal('@protoyard/ai'), z.literal('@protoyard/ai-ui')]),
    entities: TeamChatEntitySlotsSchema,
    screens: z.tuple([screen('team-chat')]),
    scenarioDefaults: ScenarioDefaultsSchema.default({ density: 'normal', activity: 'intense' }),
  }),
  z.strictObject({
    id: z.literal('saas-onboarding'),
    kits: z.tuple([z.literal('@protoyard/saas'), z.literal('@protoyard/saas-ui')]),
    entities: SaasEntitySlotsSchema,
    screens: z.tuple([screen('saas-onboarding')]),
    scenarioDefaults: ScenarioDefaultsSchema.default({ density: 'normal', activity: 'normal' }),
  }),
  z.strictObject({
    id: z.literal('analytics'),
    kits: z.tuple([
      z.literal('@protoyard/analytics'),
      z.literal('@protoyard/analytics-ui/grid'),
      z.literal('@protoyard/analytics-ui/date-range'),
    ]),
    entities: AnalyticsEntitySlotsSchema,
    screens: z.tuple([screen('analytics-dashboard')]),
    scenarioDefaults: ScenarioDefaultsSchema.default({ density: 'dense', activity: 'normal' }),
  }),
]);

export type BlueprintArchetype = z.infer<typeof ArchetypeSchema>;
export type BlueprintArchetypeInput = z.input<typeof ArchetypeSchema>;
