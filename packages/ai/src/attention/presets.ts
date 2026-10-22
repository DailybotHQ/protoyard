/**
 * Named sets of attention watchers a prototype can enable.
 *
 * Presets are pure configuration. They do not touch modules, billing or
 * product switches — those belong to the consuming prototype.
 */

import type { AttentionWatcherName } from './watchers.ts';

export type AttentionPresetId = 'full' | 'work-health' | 'engagement' | 'deadlines' | 'none';

export interface AttentionPreset {
  id: AttentionPresetId;
  label: string;
  description: string;
  watchers: readonly AttentionWatcherName[];
}

const PRESETS: Record<Exclude<AttentionPresetId, 'none'>, AttentionPreset> = {
  full: {
    id: 'full',
    label: 'Full attention',
    description: 'Every built-in watcher: overload, stall, slip, quiet people, morale and summary.',
    watchers: ['overloaded', 'stalled', 'slippingDate', 'quietPerson', 'morale', 'summaryDue'],
  },
  'work-health': {
    id: 'work-health',
    label: 'Work health',
    description: 'Overloaded owners and stalled tasks with blockers.',
    watchers: ['overloaded', 'stalled'],
  },
  engagement: {
    id: 'engagement',
    label: 'Engagement',
    description: 'Quiet stand-up responders and falling team mood.',
    watchers: ['quietPerson', 'morale'],
  },
  deadlines: {
    id: 'deadlines',
    label: 'Deadlines',
    description: 'Slipping milestones and unposted weekly summaries.',
    watchers: ['slippingDate', 'summaryDue'],
  },
};

export const ATTENTION_PRESETS: readonly AttentionPreset[] = Object.values(PRESETS);

export function attentionPreset(id: AttentionPresetId): AttentionPreset {
  if (id === 'none') {
    return {
      id: 'none',
      label: 'None',
      description: 'No watchers run.',
      watchers: [],
    };
  }
  return PRESETS[id];
}

export function attentionWatchersForPreset(id: AttentionPresetId): readonly AttentionWatcherName[] {
  return attentionPreset(id).watchers;
}
