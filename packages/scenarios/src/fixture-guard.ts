/**
 * Fixture hygiene for generated worlds and scenario sources (AGENTS.md rule 7).
 * Flags real-looking email domains and common secret/token shapes. Findings
 * carry a path and an actionable message, never the matched secret text, so a
 * real credential is not echoed into logs or validate output.
 *
 * Patterns are assembled from fragments so this file itself never matches a
 * secret scanner.
 */

/** Domains always accepted (RFC 2606 examples plus the identity helper defaults). */
export const ALLOWED_FIXTURE_EMAIL_DOMAINS = ['example.com', 'example.net', 'example.org'] as const;

/**
 * A domain is fictional when it is an exact allowed name, ends with a reserved
 * public-suffix style label (`.example`, `.test`, `.invalid`, `.localhost`),
 * or matches `*.example.com` / `*.example.net` / `*.example.org`.
 */
const FICTIONAL_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$/i;

const EMAIL = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

/** Marker key: when true on an object, that object and its children are skipped. */
export const FIXTURE_ALLOW_KEY = '$fixtureAllow' as const;

const privateKeyPattern = ['-----BEGIN ', '(?:[A-Z0-9]+ )?', 'PRIVATE KEY-----'].join('');
const jwtThreePart = [
  'eyJ',
  '[A-Za-z0-9_-]{8,}',
  '\\.',
  'eyJ',
  '[A-Za-z0-9_-]{8,}',
  '\\.',
  '[A-Za-z0-9_-]{16,}',
].join('');

export const SECRET_PATTERNS: ReadonlyArray<{ id: string; name: string; pattern: RegExp }> = [
  {
    id: 'slack-token',
    name: 'Slack token',
    pattern: new RegExp(['\\bxox', '[abposr]-[A-Za-z0-9-]{10,}\\b'].join('')),
  },
  {
    id: 'stripe-live-key',
    name: 'Stripe live key',
    pattern: new RegExp(['\\b[sp]k_', 'live_[A-Za-z0-9]{12,}\\b'].join('')),
  },
  {
    id: 'aws-access-key',
    name: 'AWS access key',
    // AKIA… / ASIA… access key ids (16 chars after the four-letter prefix).
    pattern: new RegExp(['\\b(?:AKIA|ASIA)', '[0-9A-Z]{16}\\b'].join('')),
  },
  {
    id: 'github-token',
    name: 'GitHub token',
    pattern: new RegExp(
      ['\\b(?:gh', 'p_[A-Za-z0-9]{20,}|github', '_pat_[A-Za-z0-9_]{22,})\\b'].join('')
    ),
  },
  {
    id: 'openai-key',
    name: 'OpenAI-style key',
    pattern: new RegExp(['\\bsk-', '(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}\\b'].join('')),
  },
  {
    id: 'private-key',
    name: 'private key block',
    pattern: new RegExp(privateKeyPattern),
  },
  {
    id: 'signed-jwt',
    name: 'signed JWT',
    pattern: new RegExp(`\\b${jwtThreePart}\\b`),
  },
];

export type FixtureFindingKind = 'real-email' | 'secret';

export interface FixtureFinding {
  kind: FixtureFindingKind;
  /**
   * Stable location: JSON-ish path (`tables.users[0].email`), `text` for a bare
   * string, or `file:src/scenarios/generators.ts:12` for source scans.
   */
  path: string;
  /** Machine id: `real-email` or `secret:<id>`. */
  rule: string;
  /**
   * Actionable diagnostic. Never includes a secret value; for emails includes
   * only the domain.
   */
  message: string;
  /** Email domain, or secret pattern name. */
  detail: string;
}

export interface ScanFixtureOptions {
  /** Extra exact domains (lowercased) treated as fictional. */
  allowEmailDomains?: readonly string[];
  /**
   * Path prefixes to skip (e.g. `tables.audit`). Matched with `===` or
   * `${prefix}.` / `${prefix}[`.
   */
  ignorePaths?: readonly string[];
  /** Stop after this many findings (default 100). */
  maxFindings?: number;
  /**
   * When true, objects with `{ $fixtureAllow: true }` skip that subtree.
   * Default true. Never a blanket whole-world bypass.
   */
  honorAllowMarkers?: boolean;
}

const DEFAULT_MAX = 100;

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.+$/, '');
}

/** True when the domain is reserved for documentation / fixtures. */
export function isAllowedFixtureEmailDomain(
  domain: string,
  extra: readonly string[] = []
): boolean {
  const d = normalizeDomain(domain);
  if (!d) return false;
  if (ALLOWED_FIXTURE_EMAIL_DOMAINS.some((a) => a === d)) return true;
  if (extra.some((a) => normalizeDomain(a) === d)) return true;
  return FICTIONAL_DOMAIN.test(d);
}

function pathIgnored(path: string, ignore: readonly string[]): boolean {
  for (const raw of ignore) {
    const prefix = raw.trim();
    if (!prefix) continue;
    if (path === prefix) return true;
    if (path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)) return true;
  }
  return false;
}

function pushEmail(
  findings: FixtureFinding[],
  path: string,
  domain: string,
  extra: readonly string[]
): void {
  if (isAllowedFixtureEmailDomain(domain, extra)) return;
  const d = normalizeDomain(domain);
  findings.push({
    kind: 'real-email',
    path,
    rule: 'real-email',
    detail: d,
    message:
      `${path}: real-looking email domain "${d}". ` +
      'Use example.com / example.org / example.net, a *.example (or *.test / *.invalid / *.localhost) address, or mark a structured fixture subtree with $fixtureAllow: true.',
  });
}

function pushSecret(findings: FixtureFinding[], path: string, id: string, name: string): void {
  findings.push({
    kind: 'secret',
    path,
    rule: `secret:${id}`,
    detail: name,
    message:
      `${path}: looks like ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}. ` +
      'Remove credential-shaped strings from fixtures; use placeholders such as "sk_test_…" only in docs that are not loaded as data, or mark a structured fixture subtree with $fixtureAllow: true.',
  });
}

/**
 * Scans one string. `path` labels the location in diagnostics (default `text`).
 * Does not mutate `text`.
 */
export function scanFixtureText(
  text: string,
  options: ScanFixtureOptions & { path?: string } = {}
): FixtureFinding[] {
  const path = options.path ?? 'text';
  if (pathIgnored(path, options.ignorePaths ?? [])) return [];
  const extra = options.allowEmailDomains ?? [];
  const max = options.maxFindings ?? DEFAULT_MAX;
  const findings: FixtureFinding[] = [];

  for (const match of text.matchAll(EMAIL)) {
    if (findings.length >= max) break;
    pushEmail(findings, path, match[1] ?? '', extra);
  }

  for (const { id, name, pattern } of SECRET_PATTERNS) {
    if (findings.length >= max) break;
    pattern.lastIndex = 0;
    if (pattern.test(text)) pushSecret(findings, path, id, name);
  }

  return findings.slice(0, max);
}

function pathKey(parent: string, key: string | number): string {
  if (typeof key === 'number') return parent ? `${parent}[${key}]` : `[${key}]`;
  if (!parent) return key;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

/**
 * Walks any JSON-serialisable value and reports findings with stable paths.
 * Read-only: never mutates `value`. Honors `$fixtureAllow: true` on objects
 * when `honorAllowMarkers` is true (default).
 */
export function scanFixtureValue(
  value: unknown,
  options: ScanFixtureOptions = {}
): FixtureFinding[] {
  const max = options.maxFindings ?? DEFAULT_MAX;
  const extra = options.allowEmailDomains ?? [];
  const ignore = options.ignorePaths ?? [];
  const honor = options.honorAllowMarkers !== false;
  const findings: FixtureFinding[] = [];
  const seen = new WeakSet<object>();

  const visit = (node: unknown, path: string): void => {
    if (findings.length >= max) return;
    if (pathIgnored(path, ignore)) return;

    if (typeof node === 'string') {
      for (const f of scanFixtureText(node, { path, allowEmailDomains: extra, maxFindings: max })) {
        if (findings.length >= max) break;
        // Deduplicate identical path+rule pairs from nested rescans.
        if (findings.some((x) => x.path === f.path && x.rule === f.rule && x.detail === f.detail))
          continue;
        findings.push(f);
      }
      return;
    }

    if (node === null || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) visit(node[i], pathKey(path, i));
      return;
    }

    const record = node as Record<string, unknown>;
    if (honor && record[FIXTURE_ALLOW_KEY] === true) return;

    for (const key of Object.keys(record).sort()) {
      if (key === FIXTURE_ALLOW_KEY) continue;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      visit(record[key], pathKey(path, key));
    }
  };

  visit(value, '');
  // Root strings use path "" → rewrite empty to "root" for clarity when the
  // value itself is a primitive string (visit already used path "").
  return findings.map((f) =>
    f.path === '' ? { ...f, path: 'root', message: f.message.replace(/^: /, 'root: ') } : f
  );
}

/** Scans a whole generated world (any JSON-serialisable value). Read-only. */
export function scanFixtureWorld(
  world: unknown,
  options: ScanFixtureOptions = {}
): FixtureFinding[] {
  return scanFixtureValue(world, options);
}

/** One-line diagnostic for validate / CLI output (never includes secret text). */
export function formatFixtureFinding(finding: FixtureFinding): string {
  return finding.message;
}

export interface ScanFixtureFileInput {
  /** Repository- or prototype-relative path shown in diagnostics. */
  path: string;
  /** File contents (read-only). */
  text: string;
}

/**
 * Scans source file text line by line so diagnostics can point at
 * `file:path:line`. Does not write or rewrite files.
 */
export function scanFixtureFiles(
  files: readonly ScanFixtureFileInput[],
  options: ScanFixtureOptions = {}
): FixtureFinding[] {
  const max = options.maxFindings ?? DEFAULT_MAX;
  const findings: FixtureFinding[] = [];
  for (const file of files) {
    if (findings.length >= max) break;
    const lines = file.text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (findings.length >= max) return;
      const path = `file:${file.path}:${i + 1}`;
      for (const f of scanFixtureText(line, {
        ...options,
        path,
        maxFindings: max - findings.length,
      })) {
        findings.push(f);
      }
    });
  }
  return findings.slice(0, max);
}
