/**
 * `@protoyard/review/anchors` — pin anchors that survive reflow, device
 * frames and shell changes: `createAnchor(element, point)` stores the route,
 * an element locator ladder (`data-py-anchor`, `data-testid`, a stable id, a
 * role + accessible-name path from the nearest landmark, a CSS
 * `nth-of-type` path), a text fingerprint and an offset inside the element;
 * `resolveAnchor(anchor, root)` finds it again with a confidence, or reports
 * it orphaned. `captureContext` records what the reviewer was looking at.
 */
export {
  anchorMatchesRoute,
  anchorPoint,
  type CreateAnchorOptions,
  captureContext,
  createAnchor,
  LOCATOR_CONFIDENCE,
  LOW_CONFIDENCE,
  type ResolvedAnchor,
  type ReviewContextInput,
  resolveAnchor,
} from './anchor.ts';
export {
  accessibleName,
  findAll,
  fingerprintOf,
  isGeneratedId,
  type Locator,
  locatorsFor,
  PY_ANCHOR_ATTRIBUTE,
  roleOf,
} from './locators.ts';
