import type { Blueprint } from '@protoyard/blueprint';
import type { Theme } from '@protoyard/core';

export type SettingsSection = 'profile' | 'workspace' | 'appearance' | 'notifications' | 'danger';

/** A theme the appearance picker can offer: registered themes, or library ids loaded on demand. */
export interface ThemeChoice {
  id: string;
  name: string;
}

/** Registered themes first (in runtime order), then extra choices not registered yet. */
export function themeChoices(
  registered: readonly Pick<Theme, 'id' | 'name'>[],
  library: readonly ThemeChoice[]
): ThemeChoice[] {
  const seen = new Set(registered.map((theme) => theme.id));
  return [
    ...registered.map(({ id, name }) => ({ id, name })),
    ...library.filter((theme) => !seen.has(theme.id)),
  ];
}

export interface NotificationRuleSummary {
  key: string;
  description: string;
}

const VERBS = { create: 'is created', update: 'changes', assign: 'is assigned to you' } as const;

/** Blueprint notification rules that can notify a persona with `role`, as plain sentences. */
export function notificationRulesFor(
  blueprint: Pick<Blueprint, 'notifications' | 'entities'>,
  role: string | null
): NotificationRuleSummary[] {
  return blueprint.notifications.flatMap((rule, index) => {
    const forYou =
      rule.notify === 'owner' ||
      rule.notify === 'assignee' ||
      (role !== null && rule.notify === `role:${role}`);
    if (!forYou) return [];
    const entity = blueprint.entities.find((e) => e.name === rule.entity);
    const label = (entity?.label ?? rule.entity.replace(/-/g, ' ')).toLowerCase();
    const who =
      rule.notify === 'owner'
        ? `you own`
        : rule.notify === 'assignee'
          ? 'assigned to you'
          : `for your role`;
    const description =
      rule.on === 'assign'
        ? `When a ${label} ${VERBS.assign}`
        : `When a ${label} ${who} ${VERBS[rule.on]}`;
    return [{ key: `${index}`, description }];
  });
}
