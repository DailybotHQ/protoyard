import type { Blueprint, BlueprintEntity, BlueprintScreen } from '@protoyard/blueprint';
import type { ParsedLocation } from '@protoyard/renderer-svelte';

export type DetailScreenSpec = Extract<BlueprintScreen, { type: 'detail' }>;

export function detailTabsFor(blueprint: Blueprint, entityName: string): string[] | null {
  const screen = blueprint.screens.find(
    (candidate): candidate is DetailScreenSpec =>
      candidate.type === 'detail' && candidate.entity === entityName
  );
  return screen?.tabs ? [...screen.tabs] : null;
}

export function visibleDetailTabs(tabs: readonly string[], entity: BlueprintEntity): string[] {
  return tabs.filter((tab) => {
    if (tab === 'activity' || tab === 'audit') return entity.features.audit;
    if (tab === 'files') return entity.features.files;
    return true;
  });
}

export function readDetailTab(tabs: readonly string[], location: ParsedLocation): string {
  const requested = location.query.get('tab');
  return (requested && tabs.includes(requested) ? requested : undefined) ?? tabs[0] ?? 'overview';
}

export function detailTabHref(location: ParsedLocation, tab: string): string {
  const query = new URLSearchParams(location.query);
  query.set('tab', tab);
  return `${location.path}?${query.toString()}`;
}
