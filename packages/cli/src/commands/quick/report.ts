import { lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type Blueprint, blueprintIdentity } from '@protoyard/blueprint';
import { z } from 'zod';
import { sha256Text } from '../../lib/checksum.ts';
import type { CommandResult, Handler } from '../../lib/command.ts';
import { CliError, mark } from '../../lib/output.ts';
import { toPosixRelative } from '../../lib/paths.ts';
import { readQuickRecord } from '../../lib/quick/model.ts';
import { readRecordedBlueprint, resolveExploration } from './promote.ts';

/**
 * `protoyard quick report <slug|dir> [--import <metrics.json>…]`: aggregates
 * validation sessions (the `protoyard-validation-metrics` v1 files the
 * player's task panel downloads) per variant and task into `report.json` and
 * `REPORT.md` in the exploration folder.
 *
 * - A metrics file is untrusted input: a regular file under a size cap,
 *   parsed with a strict schema, and every string that reaches the Markdown
 *   is reduced to one safe line and escaped. A malformed file, or one from a
 *   blueprint that is not this exploration or one of its variants, fails the
 *   whole run before anything is written.
 * - Imported files are kept, normalized, in `metrics/<sha256>.json`, so
 *   importing the same download twice adds nothing and later runs (with no
 *   `--import`) rebuild the same report. Each download holds every attempt
 *   recorded so far, so attempts repeated across downloads count once.
 * - The output has no clock or randomness: the same inputs give the same bytes.
 */

export const QUICK_METRICS_DIR = 'metrics';
export const QUICK_METRICS_MAX_BYTES = 2 * 1024 * 1024;
export const QUICK_METRICS_MAX_ATTEMPTS = 10_000;
const QUICK_METRICS_MAX_FILES = 256;
const REPORT_FORMAT = 'protoyard.quick-report';

const TaskId = z
  .string()
  .max(48)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const Instant = z.iso.datetime({ offset: true });

export const ValidationMetricsSchema = z
  .object({
    format: z.literal('protoyard-validation-metrics'),
    version: z.literal(1),
    blueprint: z
      .object({
        name: z.string().max(160),
        namespace: z
          .string()
          .max(64)
          .regex(/^(?:bp|keep)-[a-z0-9-]+$/),
      })
      .strict(),
    exportedAt: Instant,
    tasks: z.array(z.object({ id: TaskId, prompt: z.string().max(280) }).strict()).max(64),
    attempts: z
      .array(
        z
          .object({
            taskId: TaskId,
            outcome: z.enum(['success', 'gave-up', 'timed-out']),
            // A day at most; steps are route changes plus service calls.
            durationMs: z.number().int().min(0).max(86_400_000),
            steps: z.number().int().min(0).max(1_000_000),
            startedAt: Instant,
            endedAt: Instant,
          })
          .strict()
      )
      .max(QUICK_METRICS_MAX_ATTEMPTS),
  })
  .strict();
export type ValidationMetrics = z.infer<typeof ValidationMetricsSchema>;
type Attempt = ValidationMetrics['attempts'][number];

export interface TaskSummary {
  id: string;
  prompt: string;
  /** False for a task id the group's blueprint does not define. */
  defined: boolean;
  attempts: number;
  successes: number;
  gaveUp: number;
  timedOut: number;
  /** successes / attempts, rounded to 3 decimals; null without attempts. */
  successRate: number | null;
  /** Medians over successful attempts only; null without one. */
  medianDurationMs: number | null;
  medianSteps: number | null;
}

export interface GroupSummary {
  /** null for the base exploration. */
  variant: string | null;
  label: string;
  namespace: string;
  attempts: number;
  tasks: TaskSummary[];
}

/** One line, no control or bidi characters (the same rule as review reports). */
export function safeLine(value: string): string {
  let out = '';
  for (const ch of value.replace(/\s+/g, ' ')) {
    const code = ch.charCodeAt(0);
    const unsafe =
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x200e ||
      code === 0x200f ||
      code === 0x2028 ||
      code === 0x2029 ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069);
    if (!unsafe) out += ch;
  }
  return out.trim();
}

/** Text for a Markdown table cell: one safe line with Markdown and HTML syntax escaped. */
export function markdownCell(value: string): string {
  return safeLine(value).replace(/[\\`*_[\]<>|#!~&]/g, (ch) => `\\${ch}`);
}

/** The median of whole numbers, rounded to a whole number; null when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : Math.round(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

export function parseValidationMetrics(text: string, label: string): ValidationMetrics {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CliError('validation', `${label} is not valid JSON.`);
  }
  const parsed = ValidationMetricsSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    throw new CliError(
      'validation',
      `${label} is not a protoyard-validation-metrics v1 file (${where}${issue?.message ?? 'invalid'}).`,
      { hint: 'Use the file the player’s Download metrics button saved, unchanged.' }
    );
  }
  for (const [index, attempt] of parsed.data.attempts.entries()) {
    if (Date.parse(attempt.endedAt) < Date.parse(attempt.startedAt)) {
      throw new CliError('validation', `${label}: attempts.${index} ends before it starts.`);
    }
  }
  return parsed.data;
}

async function readCapped(path: string, label: string): Promise<string> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile()) {
    throw new CliError('not_found', `Metrics file not found: ${label}`, {
      hint: 'Pass a regular JSON file (symlinks and folders are refused).',
    });
  }
  if (info.size > QUICK_METRICS_MAX_BYTES) {
    throw new CliError(
      'validation',
      `${label} is ${info.size} bytes; the limit is ${QUICK_METRICS_MAX_BYTES}.`
    );
  }
  return readFile(path, 'utf8');
}

async function writeAtomic(path: string, text: string): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, text, 'utf8');
  await rename(temp, path);
}

const normalized = (metrics: ValidationMetrics) => `${JSON.stringify(metrics, null, 2)}\n`;
const attemptKey = (namespace: string, a: Attempt) =>
  [namespace, a.taskId, a.startedAt, a.endedAt, a.outcome, a.durationMs, a.steps].join('|');
const formatSeconds = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);
const formatRate = (rate: number | null) =>
  rate === null ? '—' : `${Math.round(rate * 1000) / 10}%`;

/** Aggregates the attempts of one group, tasks in the blueprint's order first. */
export function summarizeGroup(
  definedTasks: readonly { id: string; prompt: string }[],
  attempts: readonly Attempt[],
  fallbackPrompts: ReadonlyMap<string, string>
): TaskSummary[] {
  const ids = [
    ...definedTasks.map((task) => task.id),
    ...[...new Set(attempts.map((attempt) => attempt.taskId))]
      .filter((id) => !definedTasks.some((task) => task.id === id))
      .sort(),
  ];
  return ids.map((id) => {
    const defined = definedTasks.find((task) => task.id === id);
    const mine = attempts.filter((attempt) => attempt.taskId === id);
    const successes = mine.filter((attempt) => attempt.outcome === 'success');
    return {
      id,
      prompt: safeLine(defined?.prompt ?? fallbackPrompts.get(id) ?? ''),
      defined: defined !== undefined,
      attempts: mine.length,
      successes: successes.length,
      gaveUp: mine.filter((attempt) => attempt.outcome === 'gave-up').length,
      timedOut: mine.filter((attempt) => attempt.outcome === 'timed-out').length,
      successRate:
        mine.length === 0 ? null : Math.round((successes.length / mine.length) * 1000) / 1000,
      medianDurationMs: median(successes.map((attempt) => attempt.durationMs)),
      medianSteps: median(successes.map((attempt) => attempt.steps)),
    };
  });
}

export function renderReportMarkdown(input: {
  name: string;
  slug: string;
  sources: number;
  groups: readonly GroupSummary[];
}): string {
  const lines = [
    `# Validation report: ${markdownCell(input.name)}`,
    '',
    `Exploration \`${input.slug}\`. ${input.sources} metrics file${input.sources === 1 ? '' : 's'}, ${input.groups.reduce((n, g) => n + g.attempts, 0)} attempts after removing repeats. Success rate counts every attempt; median time and steps count successful attempts only. Simulated data only.`,
    '',
    'Scope: this report covers the current blueprint and the variants recorded in this exploration. Metrics from earlier `quick iterate` history entries and `keep` namespaces are not included.',
    '',
    'In the player, task progress (which task is current) resets when the page reloads; recorded attempts persist in the browser until the exploration is cleared, and every download includes all of them.',
  ];
  for (const group of input.groups) {
    lines.push('', `## ${markdownCell(group.label)}`, '');
    if (group.tasks.length === 0) {
      lines.push('No validation tasks and no attempts.');
      continue;
    }
    lines.push(
      '| Task | Attempts | Success rate | Median time | Median steps | Gave up | Timed out |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'
    );
    for (const task of group.tasks) {
      const name = `${markdownCell(task.prompt || task.id)} (\`${task.id}\`)${task.defined ? '' : ' (not in the blueprint)'}`;
      lines.push(
        `| ${name} | ${task.attempts} | ${formatRate(task.successRate)} | ${formatSeconds(task.medianDurationMs)} | ${task.medianSteps ?? '—'} | ${task.gaveUp} | ${task.timedOut} |`
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export const quickReportCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const dir = resolveExploration(ctx.root, args[0] ?? '');
  const record = await readQuickRecord(dir);
  const base = await readRecordedBlueprint(join(dir, 'blueprint.json'), record.blueprintSha256);

  // Every blueprint this exploration runs, by the storage namespace the player uses.
  const groups: {
    variant: string | null;
    label: string;
    blueprint: Blueprint;
    namespace: string;
  }[] = [
    {
      variant: null,
      label: `Base: ${base.blueprint.name}`,
      blueprint: base.blueprint,
      namespace: (await blueprintIdentity(base.blueprint)).namespace,
    },
  ];
  for (const variant of record.variants) {
    const loaded = await readRecordedBlueprint(
      join(dir, variant.dir, 'blueprint.json'),
      variant.blueprintSha256
    );
    groups.push({
      variant: variant.id,
      label: `${variant.id}: ${variant.label}`,
      blueprint: loaded.blueprint,
      namespace: (await blueprintIdentity(loaded.blueprint)).namespace,
    });
  }
  const known = new Map(groups.map((group) => [group.namespace, group]));
  const unknownNamespace = (namespace: string, label: string) =>
    new CliError(
      'validation',
      `${label} was recorded for another blueprint (${namespace}), not this exploration or its variants.`,
      {
        hint: `This exploration's namespaces: ${groups.map((g) => `${g.variant ?? 'base'} ${g.namespace}`).join(', ')}.`,
      }
    );

  // Validate every import before anything is written.
  const rawImports = options.import;
  const importArgs = Array.isArray(rawImports)
    ? (rawImports as unknown[]).map(String)
    : typeof rawImports === 'string'
      ? [rawImports]
      : [];
  const imports: { file: string; metrics: ValidationMetrics; text: string; sha256: string }[] = [];
  for (const file of importArgs) {
    const metrics = parseValidationMetrics(
      await readCapped(resolve(process.cwd(), file), file),
      file
    );
    if (!known.has(metrics.blueprint.namespace))
      throw unknownNamespace(metrics.blueprint.namespace, file);
    const text = normalized(metrics);
    imports.push({ file, metrics, text, sha256: sha256Text(text) });
  }

  const metricsDir = join(dir, QUICK_METRICS_DIR);
  const metricsInfo = await lstat(metricsDir).catch(() => undefined);
  if (metricsInfo && !metricsInfo.isDirectory()) {
    throw new CliError(
      'unsafe_path',
      `Refusing ${toPosixRelative(ctx.root, metricsDir)}: not a folder.`
    );
  }
  const imported: { file: string; stored: string; attempts: number; added: boolean }[] = [];
  if (imports.length > 0) await mkdir(metricsDir, { recursive: true });
  for (const entry of imports) {
    const stored = join(metricsDir, `${entry.sha256}.json`);
    const added = !(await lstat(stored).catch(() => undefined));
    if (added) await writeAtomic(stored, entry.text);
    imported.push({
      file: entry.file,
      stored: toPosixRelative(ctx.root, stored),
      attempts: entry.metrics.attempts.length,
      added,
    });
  }

  // Aggregate every stored file (re-validated: the folder is on disk, so untrusted too).
  const names = (await readdir(metricsDir).catch(() => [] as string[]))
    .filter((name) => /^[0-9a-f]{64}\.json$/.test(name))
    .sort();
  if (names.length > QUICK_METRICS_MAX_FILES) {
    throw new CliError(
      'validation',
      `More than ${QUICK_METRICS_MAX_FILES} metrics files are stored.`
    );
  }
  const byGroup = new Map<string, Attempt[]>(groups.map((group) => [group.namespace, []]));
  const prompts = new Map<string, Map<string, string>>();
  const seen = new Set<string>();
  const sources: { file: string; namespace: string; variant: string | null; attempts: number }[] =
    [];
  for (const name of names) {
    const label = `${QUICK_METRICS_DIR}/${name}`;
    const metrics = parseValidationMetrics(await readCapped(join(metricsDir, name), label), label);
    const group = known.get(metrics.blueprint.namespace);
    if (!group) throw unknownNamespace(metrics.blueprint.namespace, label);
    const groupPrompts = prompts.get(group.namespace) ?? new Map<string, string>();
    for (const task of metrics.tasks)
      if (!groupPrompts.has(task.id)) groupPrompts.set(task.id, task.prompt);
    prompts.set(group.namespace, groupPrompts);
    for (const attempt of metrics.attempts) {
      const key = attemptKey(group.namespace, attempt);
      if (seen.has(key)) continue;
      seen.add(key);
      byGroup.get(group.namespace)?.push(attempt);
    }
    sources.push({
      file: label,
      namespace: group.namespace,
      variant: group.variant,
      attempts: metrics.attempts.length,
    });
  }

  const summaries: GroupSummary[] = groups.map((group) => {
    const attempts = (byGroup.get(group.namespace) ?? []).sort(
      (a, b) => a.startedAt.localeCompare(b.startedAt) || a.taskId.localeCompare(b.taskId)
    );
    return {
      variant: group.variant,
      label: safeLine(group.label),
      namespace: group.namespace,
      attempts: attempts.length,
      tasks: summarizeGroup(
        group.blueprint.validation?.tasks ?? [],
        attempts,
        prompts.get(group.namespace) ?? new Map()
      ),
    };
  });
  const report = {
    format: REPORT_FORMAT,
    formatVersion: 1,
    slug: record.slug,
    name: safeLine(base.blueprint.name),
    sources,
    groups: summaries,
  };
  const reportPath = join(dir, 'report.json');
  const markdownPath = join(dir, 'REPORT.md');
  await writeAtomic(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeAtomic(
    markdownPath,
    renderReportMarkdown({
      name: base.blueprint.name,
      slug: record.slug,
      sources: sources.length,
      groups: summaries,
    })
  );

  const data = {
    slug: record.slug,
    dir: toPosixRelative(ctx.root, dir),
    imported,
    report: toPosixRelative(ctx.root, reportPath),
    markdown: toPosixRelative(ctx.root, markdownPath),
    sources: sources.length,
    attempts: summaries.reduce((n, group) => n + group.attempts, 0),
    groups: summaries.map(({ variant, namespace, attempts }) => ({ variant, namespace, attempts })),
  };
  return {
    data,
    render(out) {
      const { c } = out;
      for (const entry of imported) {
        out.info(
          `${mark(c, entry.added ? 'pass' : 'skip')} ${entry.file}: ${entry.attempts} attempts${entry.added ? '' : ' (already imported)'}`
        );
      }
      out.always(
        `${mark(c, 'pass')} ${c.cyan(data.markdown)}: ${data.attempts} attempts from ${data.sources} metrics file${data.sources === 1 ? '' : 's'}`
      );
      for (const group of summaries) {
        for (const task of group.tasks) {
          out.info(
            c.dim(
              `  ${(group.variant ?? 'base').padEnd(4)} ${task.id.padEnd(24)} ${task.attempts} attempts, ${formatRate(task.successRate)} success, median ${formatSeconds(task.medianDurationMs)}`
            )
          );
        }
      }
    },
  };
};
