import type { AppModel } from '@protoyard/blueprint';
import type { BusinessAdapter } from './adapter.ts';

/**
 * The app model with the archetype's screen in navigation: right after Home,
 * and first in the Overview group, so the kit screen is one click away.
 */
export function withArchetypeNav(model: AppModel, adapter: BusinessAdapter): AppModel {
  if (model.nav.some((item) => item.path === adapter.path)) return model;
  const item = { path: adapter.path, label: adapter.navLabel, icon: adapter.navIcon };
  const [home, ...rest] = model.nav;
  const groups = model.navGroups.map((group, index) =>
    index === 0
      ? { ...group, paths: [group.paths[0] ?? '/', adapter.path, ...group.paths.slice(1)] }
      : group
  );
  return {
    ...model,
    nav: home ? [home, item, ...rest] : [item],
    navGroups: groups.length > 0 ? groups : [{ label: 'Overview', paths: [adapter.path] }],
    icons: model.icons.includes(adapter.navIcon) ? model.icons : [...model.icons, adapter.navIcon],
  };
}
