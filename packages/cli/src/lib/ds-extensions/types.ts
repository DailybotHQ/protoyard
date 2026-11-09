/**
 * The catalog extension manifest (PLAN_013 T-tx015, agreed with Texuli for
 * its drop 2): the same shape as a Texuli catalog manifest (id, package,
 * label, summary, tier, props with `enumValues`, axes, states, imports) plus
 * a namespaced id (`<namespace>:<kebab-id>`) and `composes`, the Texuli
 * catalog ids the component renders. Any library that wraps Texuli can
 * publish these as plain data.
 */

export type ExtensionAxis = 'variant' | 'size' | 'tone' | 'density';

/** The closed state vocabulary of the Texuli catalog (ADR-032). */
export type ExtensionState =
  | 'hover'
  | 'focus-visible'
  | 'active'
  | 'disabled'
  | 'loading'
  | 'invalid'
  | 'selected'
  | 'expanded'
  | 'checked'
  | 'open'
  | 'readonly';

export interface ExtensionProp {
  name: string;
  kind:
    | 'string'
    | 'number'
    | 'boolean'
    | 'enum'
    | 'array'
    | 'object'
    | 'slot'
    | 'event'
    | 'unknown';
  enumValues?: readonly string[];
  default?: unknown;
  description?: string;
}

export interface CatalogExtensionManifest {
  /** `<namespace>:<kebab-id>`, for example `protoyard:data-table`. */
  id: string;
  /** The package that exports the component. */
  package: string;
  label: string;
  summary: string;
  tier: 'app' | 'content';
  agentEmittable?: boolean;
  useWhen: readonly string[];
  dontUseWhen: readonly string[];
  a11y: string | readonly string[];
  props: readonly ExtensionProp[];
  examples: readonly { id: string; title: string; props: Readonly<Record<string, unknown>> }[];
  related?: readonly string[];
  /** Axis → the enum prop that drives it. */
  axes?: Readonly<Partial<Record<ExtensionAxis, string>>>;
  states?: readonly ExtensionState[];
  /** Where the component is imported from: `{ module, exports }`. */
  imports: readonly { module: string; exports: readonly string[] }[];
  /** Texuli catalog ids the component renders (its parts count). */
  composes: readonly string[];
}
