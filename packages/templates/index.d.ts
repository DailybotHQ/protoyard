/** One packed template: its folder name, absolute folder and parsed protoyard.json. */
export interface TemplateEntry {
  name: string;
  dir: string;
  /** The template's protoyard.json, parsed but not validated (the CLI validates it). */
  manifest: Record<string, unknown>;
}

/**
 * Where the templates live: the packed `templates/` next to this module, or,
 * inside the Protoyard repository, the repository's own `templates/`.
 */
export declare const TEMPLATES_ROOT: string;

/** Every template folder that has a protoyard.json, sorted by name. */
export declare function listTemplates(root?: string): TemplateEntry[];

/**
 * The absolute folder of template `name`. Throws on a name that is not a
 * slug (no paths, no traversal) or that has no protoyard.json.
 */
export declare function templateDir(name: string, root?: string): string;
