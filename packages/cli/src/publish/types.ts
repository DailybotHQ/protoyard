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
  /** Absolute path of the exported ZIP (static provider). */
  zipPath?: string;
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
