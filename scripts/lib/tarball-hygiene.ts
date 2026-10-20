/**
 * Public-hygiene rules for what a packed tarball actually contains.
 *
 * scripts/check-public-hygiene.sh scans tracked files only, but a tarball also
 * carries generated output git never sees: dist/, declaration and source maps
 * (which embed paths and, with sourcesContent, whole files). This runs the
 * same content rules (`scanText` from packages/cli/src/lib/hygiene.ts) over
 * every text file in the tarball, plus rules that only make sense there:
 *
 *   env-file          a .env / .env.* / .envrc file (.env.example allowed)
 *   key-file          a private key or credential file (*.pem, *.key, id_rsa…, .npmrc)
 *   personal-path     also Windows home paths (C:\Users\<name>)
 *   source-map-path   an absolute `sourceRoot` or `sources` entry in a map
 *   real-email        an email whose domain is not reserved for examples
 *                     (example.com/.net/.org, *.example, *.test, *.invalid,
 *                     *.localhost) and not a public Dailybot alias
 *
 * Findings carry path, line and rule, never the matched text. Binary files
 * (a NUL byte in the first 8 KB) are skipped for content rules. A secret-*
 * hit can be allowed only through the repository's .public-hygiene-allow,
 * by the file's repository path, and only when the line says fake/test/example
 * — the same contract as the shell check.
 */
import { scanText } from '../../packages/cli/src/lib/hygiene.ts';

export interface TarballHygieneFinding {
  /** Path inside the tarball (without `package/`). */
  path: string;
  line: number;
  rule: string;
}

export interface AllowEntry {
  /** Repository-relative path. */
  path: string;
  rule: string;
}

export interface TarballHygieneOptions {
  /** Repository-relative folder of the package, to match allow entries. */
  packagePath?: string;
  allow?: readonly AllowEntry[];
}

const FAKE_MARKER = /fake|test|planted|example|dummy/i;
const ENV_FILE = /(^|\/)(\.env(\.[^/]*)?|\.envrc)$/;
const ENV_EXAMPLE = /(^|\/)\.env(\.[^/]+)?\.example$/;
const KEY_FILE =
  /(^|\/)(id_(rsa|dsa|ecdsa|ed25519)|[^/]+\.(pem|key|p12|pfx|jks|keystore)|\.npmrc|\.netrc|\.pgpass)$/i;
const WINDOWS_HOME = /\b[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}[A-Za-z0-9][A-Za-z0-9._-]*/;
const WINDOWS_HOME_EXCEPT = /[\\/]Users[\\/]{1,2}(Public|Default|runneradmin)([^A-Za-z0-9_-]|$)/i;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
const FICTIONAL_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$/i;
const PUBLIC_ALIAS = /^(security|support|hello|oss|opensource|ops|noreply)@dailybot\.com$/i;
const MAP_FILE = /\.map$/;
const ABSOLUTE = /^(\/|file:|[A-Za-z]:[\\/])/;

/** True when the bytes look binary (a NUL in the first 8 KB, like grep -I). */
export function isBinary(data: Uint8Array): boolean {
  const end = Math.min(data.length, 8192);
  for (let i = 0; i < end; i++) if (data[i] === 0) return true;
  return false;
}

/** Parses `.public-hygiene-allow`: `<path> <secret-rule> <reason>` lines. */
export function parseAllowFile(text: string): AllowEntry[] {
  const entries: AllowEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [path, rule, ...reason] = line.split(/\s+/);
    if (!path || !rule?.startsWith('secret-') || reason.length === 0) continue;
    entries.push({ path, rule });
  }
  return entries;
}

function fileRules(path: string): TarballHygieneFinding[] {
  const findings: TarballHygieneFinding[] = [];
  if (ENV_FILE.test(path) && !ENV_EXAMPLE.test(path)) {
    findings.push({ path, line: 1, rule: 'env-file' });
  }
  if (KEY_FILE.test(path)) findings.push({ path, line: 1, rule: 'key-file' });
  return findings;
}

function lineRules(path: string, lines: readonly string[]): TarballHygieneFinding[] {
  const findings: TarballHygieneFinding[] = [];
  lines.forEach((text, i) => {
    if (WINDOWS_HOME.test(text) && !WINDOWS_HOME_EXCEPT.test(text)) {
      findings.push({ path, line: i + 1, rule: 'personal-path' });
    }
    for (const match of text.matchAll(EMAIL)) {
      const domain = match[1] ?? '';
      if (FICTIONAL_DOMAIN.test(domain) || PUBLIC_ALIAS.test(match[0])) continue;
      // The shell check's private-email rule already covers @dailybot.com.
      if (/^dailybot\.com$/i.test(domain)) continue;
      findings.push({ path, line: i + 1, rule: 'real-email' });
      break;
    }
  });
  return findings;
}

function sourceMapRules(path: string, text: string): TarballHygieneFinding[] {
  let map: { sourceRoot?: unknown; sources?: unknown };
  try {
    map = JSON.parse(text) as typeof map;
  } catch {
    return [];
  }
  const entries = [
    ...(typeof map.sourceRoot === 'string' ? [map.sourceRoot] : []),
    ...(Array.isArray(map.sources) ? map.sources.filter((s) => typeof s === 'string') : []),
  ];
  return entries.some((entry) => ABSOLUTE.test(entry))
    ? [{ path, line: 1, rule: 'source-map-path' }]
    : [];
}

/** Every hygiene finding for a tarball's files, sorted by path, line and rule. */
export function scanTarballFiles(
  files: ReadonlyMap<string, Uint8Array>,
  options: TarballHygieneOptions = {}
): TarballHygieneFinding[] {
  const allow = options.allow ?? [];
  const findings: TarballHygieneFinding[] = [];
  for (const [path, data] of files) {
    findings.push(...fileRules(path));
    if (isBinary(data)) continue;
    const text = new TextDecoder().decode(data);
    const lines = text.split(/\r?\n/);
    const repoPath = options.packagePath ? `${options.packagePath}/${path}` : path;
    for (const finding of scanText(path, text)) {
      const allowed =
        finding.rule.startsWith('secret-') &&
        allow.some((a) => a.path === repoPath && a.rule === finding.rule) &&
        FAKE_MARKER.test(lines[finding.line - 1] ?? '');
      if (!allowed) findings.push(finding);
    }
    findings.push(...lineRules(path, lines));
    if (MAP_FILE.test(path)) findings.push(...sourceMapRules(path, text));
  }
  return findings.sort(
    (a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule)
  );
}
