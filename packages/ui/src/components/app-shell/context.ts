import { getContext, setContext } from 'svelte';

export interface AppShellContext {
  readonly sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

const SHELL_KEY = Symbol('protoyard.app-shell');
const DRAWER_KEY = Symbol('protoyard.app-shell.drawer');

export function setAppShellContext(context: AppShellContext): void {
  setContext(SHELL_KEY, context);
}

/** Lets Header (menu button) and Sidebar (drawer behavior) cooperate with an enclosing AppShell. */
export function getAppShellContext(): AppShellContext | undefined {
  return getContext<AppShellContext | undefined>(SHELL_KEY);
}

export function markInDrawer(): void {
  setContext(DRAWER_KEY, true);
}

export function isInDrawer(): boolean {
  return getContext<boolean | undefined>(DRAWER_KEY) === true;
}
