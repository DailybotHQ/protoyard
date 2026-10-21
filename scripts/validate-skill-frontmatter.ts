import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SKILL_NAME = /^protoyard(?:-[a-z0-9]+)*$/;
const DOCUMENTATION_URL = 'https://protoyard.app/docs/';
const ALLOWED_TOOLS = new Set(['Bash', 'Read', 'Grep', 'Glob', 'Edit', 'Write']);

type FrontmatterValue = boolean | number | string | FrontmatterMap | FrontmatterValue[];
interface FrontmatterMap {
  [key: string]: FrontmatterValue;
}

export interface FrontmatterIssue {
  file: string;
  field: string;
  message: string;
}

interface ParsedFrontmatter {
  values: FrontmatterMap;
  raw: string;
}

interface StackEntry {
  indent: number;
  value: FrontmatterMap | FrontmatterValue[];
}

function scalar(value: string): FrontmatterValue {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const quote = trimmed[0];
    const body = trimmed.slice(1, -1);
    return quote === '"'
      ? body.replace(/\\(["\\nrt])/g, (_match, escaped: string) => {
          if (escaped === 'n') return '\n';
          if (escaped === 'r') return '\r';
          if (escaped === 't') return '\t';
          return escaped;
        })
      : body.replace(/''/g, "'");
  }
  if (trimmed === '[]') return [];
  if (trimmed === '{}') return {};
  return trimmed;
}

function stripComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if ((character === '"' || character === "'") && line[index - 1] !== '\\') {
      quote = quote === character ? null : (quote ?? character);
    }
    if (character === '#' && quote === null && (index === 0 || /\s/.test(line[index - 1] ?? ''))) {
      return line.slice(0, index).trimEnd();
    }
  }
  return line;
}

function parseFrontmatter(path: string): ParsedFrontmatter {
  const source = readFileSync(path, 'utf8');
  const opening = source.startsWith('---\n') || source.startsWith('---\r\n');
  if (!opening) throw new Error('frontmatter must start with ---');
  const lines = source.split(/\r?\n/);
  const closing = lines.findIndex((line, index) => index > 0 && line === '---');
  if (closing < 0) throw new Error('frontmatter must close with ---');
  const rawLines = lines.slice(1, closing);
  const values: FrontmatterMap = {};
  const stack: StackEntry[] = [{ indent: -1, value: values }];

  for (let index = 0; index < rawLines.length; index += 1) {
    const original = rawLines[index] ?? '';
    if (/\t/.test(original)) throw new Error(`frontmatter line ${index + 2} contains a tab`);
    const line = stripComment(original);
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    while (stack.length > 1 && indent <= (stack.at(-1)?.indent ?? -1)) stack.pop();
    const parentEntry = stack.at(-1);
    if (!parentEntry) throw new Error(`frontmatter line ${index + 2} has no parent`);
    const parent = parentEntry.value;
    const content = line.trim();
    if (content.startsWith('- ')) {
      if (!Array.isArray(parent))
        throw new Error(`frontmatter line ${index + 2} has an unexpected list item`);
      parent.push(scalar(content.slice(2)));
      continue;
    }
    if (Array.isArray(parent)) throw new Error(`frontmatter line ${index + 2} needs a list item`);
    const separator = content.indexOf(':');
    if (separator < 1) throw new Error(`frontmatter line ${index + 2} needs key: value`);
    const key = content.slice(0, separator).trim();
    const rawValue = content.slice(separator + 1).trim();
    if (key in parent) throw new Error(`frontmatter line ${index + 2} repeats key '${key}'`);
    if (rawValue) {
      parent[key] = scalar(rawValue);
      continue;
    }
    const next = rawLines.slice(index + 1).find((candidate) => candidate.trim());
    const nextContent = next?.trim() ?? '';
    const nextIndent = next ? next.length - next.trimStart().length : -1;
    const child: FrontmatterMap | FrontmatterValue[] =
      nextIndent > indent && nextContent.startsWith('- ') ? [] : {};
    parent[key] = child;
    stack.push({ indent, value: child });
  }
  return { values, raw: rawLines.join('\n') };
}

function asMap(value: FrontmatterValue | undefined): FrontmatterMap | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function issue(file: string, field: string, message: string): FrontmatterIssue {
  return { file, field, message };
}

function validateParsed(
  file: string,
  parsed: ParsedFrontmatter,
  expectedName?: string
): FrontmatterIssue[] {
  const values = parsed.values;
  const issues: FrontmatterIssue[] = [];
  const name = values.name;
  if (typeof name !== 'string' || !name) {
    issues.push(issue(file, 'name', 'is required and must be a string'));
  } else if (!SKILL_NAME.test(name)) {
    issues.push(
      issue(file, 'name', `must be namespaced kebab-case beginning with protoyard (got '${name}')`)
    );
  } else if (expectedName !== undefined && name !== expectedName) {
    issues.push(
      issue(file, 'name', `must be '${expectedName}' to match its folder (got '${name}')`)
    );
  }

  const description = values.description;
  if (typeof description !== 'string' || !description.trim()) {
    issues.push(issue(file, 'description', 'is required and must be non-empty text'));
  }

  const version = values.version;
  const rawVersion = parsed.raw.match(/^version:\s*(.*)$/m)?.[1]?.trim();
  if (typeof version !== 'string' || !version) {
    issues.push(issue(file, 'version', 'is required and must be a quoted SemVer string'));
  } else if (!rawVersion || !/^(["']).*\1$/.test(rawVersion)) {
    issues.push(issue(file, 'version', 'must be quoted (for example version: "1.0.0")'));
  } else if (!SEMVER.test(version)) {
    issues.push(issue(file, 'version', `must be SemVer-shaped X.Y.Z (got '${version}')`));
  }

  if (values.homepage !== undefined) {
    issues.push(issue(file, 'homepage', 'is forbidden; use documentation_url instead'));
  }
  if (values.documentation_url !== DOCUMENTATION_URL) {
    issues.push(issue(file, 'documentation_url', `must be ${DOCUMENTATION_URL}`));
  }

  if (typeof values['user-invocable'] !== 'boolean') {
    issues.push(
      issue(file, 'user-invocable', 'is required and must be the YAML boolean true or false')
    );
  }

  const allowedTools = values['allowed-tools'];
  if (typeof allowedTools !== 'string' || !allowedTools.trim()) {
    issues.push(
      issue(file, 'allowed-tools', 'is required and must be a non-empty comma-separated list')
    );
  } else {
    for (const tool of allowedTools.split(',').map((part) => part.trim())) {
      if (!ALLOWED_TOOLS.has(tool))
        issues.push(issue(file, 'allowed-tools', `contains unsupported tool '${tool}'`));
    }
  }

  const metadata = asMap(values.metadata);
  const openclaw = asMap(metadata?.openclaw);
  if (!openclaw) {
    issues.push(issue(file, 'metadata.openclaw', 'is required and must be a mapping'));
  } else {
    if (typeof openclaw.emoji !== 'string' || !openclaw.emoji.trim()) {
      issues.push(issue(file, 'metadata.openclaw.emoji', 'is required and must be non-empty text'));
    }
    if (openclaw.homepage !== DOCUMENTATION_URL) {
      issues.push(issue(file, 'metadata.openclaw.homepage', `must be ${DOCUMENTATION_URL}`));
    }
    const requires = asMap(openclaw.requires);
    const anyBins = requires?.anyBins;
    if (
      !Array.isArray(anyBins) ||
      anyBins.length === 0 ||
      anyBins.some((bin) => typeof bin !== 'string' || !bin.trim())
    ) {
      issues.push(
        issue(
          file,
          'metadata.openclaw.requires.anyBins',
          'is required and must be a non-empty list of binary names'
        )
      );
    }
  }
  return issues;
}

/**
 * The name a SKILL.md must carry: `protoyard` for the router at the skill
 * root, `protoyard-<folder>` for a sub-skill (`kits/SKILL.md` is `protoyard-kits`).
 */
export function expectedSkillName(skillsRoot: string, path: string): string {
  const folder = relative(skillsRoot, dirname(path));
  return folder === '' ? 'protoyard' : `protoyard-${folder.split(/[\\/]/).join('-')}`;
}

export function validateSkillFile(
  path: string,
  displayPath = path,
  expectedName?: string
): FrontmatterIssue[] {
  try {
    return validateParsed(displayPath, parseFrontmatter(path), expectedName);
  } catch (error) {
    return [
      issue(displayPath, 'frontmatter', error instanceof Error ? error.message : String(error)),
    ];
  }
}

function findSkillFiles(root: string): string[] {
  const found: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (entry === 'SKILL.md') found.push(path);
    }
  };
  if (existsSync(root)) visit(root);
  return found;
}

export function validateSkillTree(
  root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
): FrontmatterIssue[] {
  const skillsRoot = join(root, 'skills', 'protoyard');
  if (!existsSync(skillsRoot))
    return [issue('skills/protoyard', 'tree', 'skill directory does not exist')];
  return findSkillFiles(skillsRoot).flatMap((path) =>
    validateSkillFile(path, relative(root, path), expectedSkillName(skillsRoot, path))
  );
}

export function main(): number {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const skillsRoot = join(root, 'skills', 'protoyard');
  const files = findSkillFiles(skillsRoot);
  if (files.length === 0) {
    console.error('ERROR: no skills/protoyard/SKILL.md files found');
    return 2;
  }
  let count = 0;
  for (const path of files) {
    const displayPath = relative(root, path);
    const issues = validateSkillFile(path, displayPath, expectedSkillName(skillsRoot, path));
    if (issues.length === 0) {
      console.log(`✓ ${displayPath}`);
      continue;
    }
    count += issues.length;
    console.log(`✗ ${displayPath}`);
    for (const failure of issues) console.log(`    - ${failure.field}: ${failure.message}`);
  }
  if (count > 0) {
    console.log(`FAIL: ${count} frontmatter issue(s) across ${files.length} SKILL.md file(s)`);
    return 1;
  }
  console.log(`OK: all ${files.length} SKILL.md file(s) validated`);
  return 0;
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === resolve(fileURLToPath(import.meta.url))) process.exitCode = main();
