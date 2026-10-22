/**
 * Hard bounds for one chat message. A message is untrusted input (an agent,
 * a scenario file, a share link), so every list and string has a cap, and the
 * whole document has a byte, depth and block budget checked before parsing.
 */
export const MESSAGE_LIMITS = Object.freeze({
  /** Serialized UTF-8 JSON bytes of the whole message. */
  maxBytes: 64 * 1024,
  /** JSON object/array nesting. */
  maxDepth: 8,
  maxBlocks: 50,
  /** Body of a text block. */
  maxTextLength: 4_000,
  /** Labels, placeholders, headers, option names, titles. */
  maxLabelLength: 120,
  /** Descriptions, confirmation bodies, link-preview descriptions. */
  maxDescriptionLength: 500,
  /** Action ids and button values the host receives. */
  maxActionLength: 120,
  maxUrlLength: 2_048,
  maxButtons: 5,
  maxOptions: 100,
  maxFormFields: 20,
  maxTableColumns: 12,
  maxTableRows: 100,
  maxCellLength: 500,
  maxAttachments: 10,
  maxFileNameLength: 255,
  /** Declared size of one attachment, in bytes. */
  maxAttachmentBytes: 25 * 1024 * 1024,
  /** An inline `data:` image attachment, decoded bytes. */
  maxDataUriBytes: 256 * 1024,
});

export type MessageLimits = typeof MESSAGE_LIMITS;
