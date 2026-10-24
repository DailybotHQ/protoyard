import { registerAppLayouts } from 'texuli/layouts/app';
import { registerAuthSettingsLayouts } from 'texuli/layouts/auth-settings';
import { registerDashboardLayouts } from 'texuli/layouts/dashboard/register';
import { registerLayout } from 'texuli/layouts/host';
import { registerMarketingLayouts } from 'texuli/layouts/marketing/register';
import { registerMobileLayouts } from 'texuli/layouts/mobile/register';

let registered = false;

/**
 * Fills texuli's layout registry for Protoyard's LayoutHost, once, with
 * texuli's own registration (each layout a separate lazy import, one owner
 * per id). `docs` stays Protoyard's: its contract differs from texuli's (a
 * `navigation` snippet rather than the nav model, and wide only, falling
 * back to mobile-drawer).
 */
export function registerProtoyardLayouts(): void {
  if (registered) return;
  registered = true;
  registerAppLayouts();
  registerMobileLayouts();
  registerAuthSettingsLayouts();
  registerDashboardLayouts();
  registerMarketingLayouts();
  registerLayout('docs', { load: () => import('./DocsLayout.svelte'), owner: 'protoyard' });
}
