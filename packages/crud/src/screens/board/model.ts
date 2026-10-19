import type { BlueprintScreen } from '@protoyard/blueprint';

/** The validated blueprint configuration accepted by `BoardScreen`. */
export type BoardScreenSpec = Extract<BlueprintScreen, { type: 'board' }>;
