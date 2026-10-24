/**
 * Dependency-light safety predicates — thin re-export of
 * `@texuli/blocks/core` (avatar ids, data URIs, relative media, unsafe text).
 * The player's first screen imports `@protoyard/blocks/safety` so it does not
 * pull the Zod schema graph.
 */
export {
  base64DecodedBytes,
  classifyMediaSource,
  hasUnsafeText,
  isUnsafeTextCharacter,
  MEDIA_DATA_URI_MAX_BYTES,
  type MediaKind,
  type MediaSourceKind,
  normalizeLineSeparators,
} from '@texuli/blocks/core';
