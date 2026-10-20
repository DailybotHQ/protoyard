/**
 * Publish adapter contract. Adapters only build argv arrays and parse
 * provider output; they never invent a URL. If the provider's output has no
 * deployment URL, publishing fails with the raw tail of the output.
 */

export type PublishTarget = 'preview' | 'production';

export interface PublishInput {
  slug: string;
  /** Absolute path of the built dist folder. */
  distDir: string;
  /** Provider project/site name. */
  project: string;
  target: PublishTarget;
  /** Cloudflare Pages preview branch; unsupported by other adapters. */
  branch?: string;
  /** Absolute path of the exported ZIP (static provider). */
  zipPath?: string;
  /**
   * Opt-in: create the provider project when missing (Cloudflare Pages today).
   * Dry runs always list the setup argv; real publishes check existence first.
   */
  ensureProject?: boolean;
}

export interface PublishResult {
  url: string;
  deploymentId?: string;
  /** Extra provider facts worth showing (alias URL, logs URL…). */
  details?: Record<string, string>;
}

export interface Availability {
  available: boolean;
  /** How the CLI will be invoked, e.g. `wrangler` or `npx --no-install wrangler`. */
  via?: string;
  version?: string;
  hint?: string;
}

export interface AuthStatus {
  authenticated: boolean;
  /** Never a token: "logged in", "API token set", or why not. */
  detail: string;
  hint?: string;
}

/** Shared review comments store behind the Cloudflare worker (`publish --comments`). */
export type CommentsStoreKind = 'd1' | 'kv';

/**
 * One-time Cloudflare setup for `publish --comments`, printed for the
 * developer to run. The CLI never runs these commands: they create cloud
 * resources and need the developer's credentials.
 */
export interface CommentsSetup {
  store: CommentsStoreKind;
  /** Binding name the worker reads (`REVIEW_DB` or `REVIEW_KV`). */
  binding: string;
  /** D1 database name or KV namespace title the commands create. */
  resource: string;
  /** Create the store (and, for D1, apply the schema), in order. */
  commands: string[][];
  /** Optional shared key; it discourages casual writes and is not authentication. */
  secret: string[];
  /** What the commands cannot do (binding the store to the Pages project). */
  notes: string[];
}

export interface PublishProvider {
  id: 'cloudflare' | 'netlify' | 'vercel' | 'static';
  label: string;
  /** Experimental adapters are implemented but not verified against the real service. */
  experimental: boolean;
  /** Default project name for a slug. */
  defaultProject(slug: string): string;
  validateProject(project: string): string | null;
  /** `localOnly`: PATH and node_modules/.bin only, no npx (used by --dry-run). */
  isAvailable(options?: { localOnly?: boolean }): Promise<Availability>;
  isAuthenticated(): Promise<AuthStatus>;
  /** The exact command `publish` would run (for --dry-run and logs). */
  command(input: PublishInput): string[];
  /** Commands run before `command` (e.g. linking a project), shown by --dry-run too. */
  setupCommands?(input: PublishInput): string[][];
  /** One-time comments store setup, printed and never run (Cloudflare only). */
  commentsSetup?(
    input: PublishInput,
    comments: { store: CommentsStoreKind; schemaFile: string }
  ): CommentsSetup;
  publish(input: PublishInput): Promise<PublishResult>;
}

export class ProviderError extends Error {
  readonly hint: string | undefined;
  readonly kind: 'provider' | 'auth';
  constructor(message: string, options: { hint?: string; kind?: 'provider' | 'auth' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.hint = options.hint;
    this.kind = options.kind ?? 'provider';
  }
}
