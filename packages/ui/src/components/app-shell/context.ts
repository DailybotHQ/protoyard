/**
 * The app-shell context is Texuli's (`texuli/layouts/shells`): `AppShell`
 * (re-exported from Texuli) provides it, and `Header` (menu button) and
 * `Sidebar` (drawer behavior) read it.
 */
export {
  type AppShellContext,
  getAppShellContext,
  isInDrawer,
  markInDrawer,
  setAppShellContext,
} from 'texuli/layouts/shells';
