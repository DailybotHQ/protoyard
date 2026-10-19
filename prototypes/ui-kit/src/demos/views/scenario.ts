import { composeScenario, createGenerateContextAsync, PRESETS } from '@protoyard/scenarios';
import type { ViewsFragment } from '@protoyard/views/scenarios';

/** Build deterministic demo fixtures through the same fragments used by prototypes. */
export function createViewDemoContext(id: string, fragment: ViewsFragment) {
  return createGenerateContextAsync(
    composeScenario(PRESETS['first-week'], fragment, { id: `ui-kit-${id}` })
  );
}
