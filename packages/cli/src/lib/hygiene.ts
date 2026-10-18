/**
 * The content rules of scripts/check-public-hygiene.sh, for text the CLI is
 * about to package (the spec rebuild kit). Same patterns and exceptions,
 * except that nothing can be allow-listed here: a kit is refused on any
 * secret-shaped string. Findings carry path, line and rule, never the
 * matched text, so a real secret is not echoed.
 */

interface Rule {
  id: string;
  pattern: RegExp;
  /** A matching line that also matches this is not a finding. */
  except?: RegExp;
}

const RULES: readonly Rule[] = [
  {
    id: 'personal-path',
    pattern: /(^|[^A-Za-z0-9_.~/-])\/(Users|home)\/[A-Za-z0-9][A-Za-z0-9._-]*/,
    except: /\/(Users|home)\/(runner|node|user|ubuntu|vscode|dev)([^A-Za-z0-9_-]|$)/,
  },
  {
    id: 'private-email',
    pattern: /[A-Za-z0-9._%+-]+@dailybot\.com/i,
    except: /(security|support|hello|oss|opensource|ops|noreply)@dailybot\.com/i,
  },
  { id: 'secret-aws', pattern: /(AKIA|ASIA)[0-9A-Z]{16}/ },
  {
    id: 'secret-github',
    pattern: /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}/,
  },
  {
    id: 'secret-ai',
    pattern:
      /sk-ant-[A-Za-z0-9_-]{20,}|sk-(proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}/,
  },
  { id: 'secret-slack', pattern: /xox[abposr]-[A-Za-z0-9-]{10,}/ },
  { id: 'secret-google', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { id: 'secret-private-key', pattern: /-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY-----/ },
  {
    id: 'secret-npm',
    pattern: /npm_[A-Za-z0-9]{36}|_authToken\s*=\s*[^$\s][^\s]{8,}/,
  },
  { id: 'secret-jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    id: 'secret-assignment',
    pattern:
      /(api[_-]?key|secret|token|passw(or)?d|access[_-]?key)[A-Za-z0-9_]*["']?\s*[:=]\s*["'][^"'\s$]{16,}["']/i,
  },
  {
    id: 'secret-env',
    pattern:
      /^\s*(export\s+)?[A-Z0-9_]*(API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|ACCESS_KEY)[A-Z0-9_]*=[^"'\s$]{16,}/,
  },
];

export interface HygieneFinding {
  path: string;
  line: number;
  rule: string;
}

/** Scans one text file; returns findings without the matched text. */
export function scanText(path: string, text: string): HygieneFinding[] {
  const findings: HygieneFinding[] = [];
  const lines = text.split(/\r?\n/);
  for (const rule of RULES) {
    lines.forEach((line, i) => {
      if (rule.pattern.test(line) && !rule.except?.test(line)) {
        findings.push({ path, line: i + 1, rule: rule.id });
      }
    });
  }
  return findings.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1));
}
