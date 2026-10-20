import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SkillLinkIssue {
  source: string;
  line: number;
  destination: string;
  reason: string;
}

interface MarkdownLink {
  destination: string;
  line: number;
}

function isInside(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return (
    pathFromRoot === '' ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))
  );
}

function withoutMarkdownCode(text: string): string {
  return text
    .replace(/^\s*```[^\n]*\n[\s\S]*?^\s*```[^\n]*(?:\n|$)/gm, (block) =>
      block.replace(/[^\n]/g, ' ')
    )
    .replace(/`[^`\n]*`/g, (code) => code.replace(/[^\n]/g, ' '));
}

export function findMarkdownLinks(markdown: string): MarkdownLink[] {
  const searchable = withoutMarkdownCode(markdown);
  const matches: MarkdownLink[] = [];
  const patterns = [
    /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]*)>|([^\s)]+))(?:\s+[^)]*)?\s*\)/g,
    /^\s*\[[^\]\n]+\]:\s*(?:<([^>\n]*)>|([^\s]+))/gm,
  ];

  for (const pattern of patterns) {
    for (const match of searchable.matchAll(pattern)) {
      const destination = match[1] ?? match[2];
      if (destination === undefined) continue;
      const index = match.index ?? 0;
      matches.push({
        destination,
        line: searchable.slice(0, index).split('\n').length,
      });
    }
  }

  return matches;
}

async function markdownFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(path);
  }
  return files;
}

export async function validateSkillLinks(skillRoot: string): Promise<SkillLinkIssue[]> {
  const root = await realpath(skillRoot);
  const issues: SkillLinkIssue[] = [];

  for (const sourcePath of await markdownFiles(root)) {
    const markdown = await readFile(sourcePath, 'utf8');
    for (const { destination, line } of findMarkdownLinks(markdown)) {
      // Web, email, and other explicitly addressed destinations are documented
      // references. This local check intentionally performs no network access.
      if (/^[a-z][a-z\d+.-]*:/i.test(destination) || destination.startsWith('//')) continue;

      const pathPart = destination.split(/[?#]/, 1)[0] ?? '';
      if (pathPart === '') continue;

      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(pathPart);
      } catch {
        issues.push({
          source: relative(root, sourcePath),
          line,
          destination,
          reason: 'contains invalid percent encoding',
        });
        continue;
      }

      const targetPath = resolve(dirname(sourcePath), decodedPath);
      const source = relative(root, sourcePath);
      if (!isInside(root, targetPath)) {
        issues.push({ source, line, destination, reason: 'resolves outside skills/protoyard' });
        continue;
      }

      try {
        await lstat(targetPath);
        const resolvedTarget = await realpath(targetPath);
        if (!isInside(root, resolvedTarget)) {
          issues.push({
            source,
            line,
            destination,
            reason: 'follows a symlink outside skills/protoyard',
          });
        }
      } catch {
        issues.push({ source, line, destination, reason: 'target does not exist' });
      }
    }
  }

  return issues;
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const skillRoot = resolve(repositoryRoot, 'skills/protoyard');
  const issues = await validateSkillLinks(skillRoot);

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.source}:${issue.line}: ${issue.destination} — ${issue.reason}`);
    }
    console.error(
      `Found ${issues.length} invalid skill-local link${issues.length === 1 ? '' : 's'}.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Validated relative Markdown links in ${skillRoot}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
