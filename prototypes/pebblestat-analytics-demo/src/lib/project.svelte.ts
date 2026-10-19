/**
 * The project every screen shows (presentation state, not data). Pebblestat
 * tracks two products; the sidebar switcher changes this for every screen.
 */
export const DEFAULT_PROJECT = 'proj_web';

const state = $state<{ id: string }>({ id: DEFAULT_PROJECT });

export const currentProject = {
  get id(): string {
    return state.id;
  },
  set(id: string) {
    state.id = id;
  },
};
