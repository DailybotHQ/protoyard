/**
 * `@protoyard/decks/agent`: "Debug for agents". `describeSlideForAgent`
 * names the slide on screen (id, position, step, layout, JSON pointers, text,
 * lint findings), `formatAgentReference` renders it as a line, a Markdown
 * prompt or JSON, and `parseAgentReference` reads a pasted line back. Pure
 * functions: a subpath so the lint rules never enter a deck entry.
 */

export {
  AGENT_REFERENCE_FORMAT,
  AGENT_REFERENCE_LIMITS,
  AGENT_REFERENCE_MAX_BYTES,
  AGENT_REFERENCE_VERSION,
  type AgentReferenceBlock,
  type AgentReferenceFinding,
  type AgentReferenceSource,
  type AgentSlideReference,
  capText,
  cleanReferenceText,
  type DeckLocationInput,
  type DescribeSlideOptions,
  describeSlideForAgent,
  jsonPointer,
  referenceBytes,
  safeAgentSource,
} from './describe.ts';
export {
  AGENT_REFERENCE_FORMATS,
  type AgentReferenceFormat,
  formatAgentReference,
  type ParsedAgentReference,
  parseAgentReference,
  SLIDE_REF_PREFIX,
} from './reference.ts';
