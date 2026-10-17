import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { RESERVED_TABLES, SNAPSHOT_MAX_BYTES, validateSnapshot } from '@protoyard/core';
import type { CommandResult, Handler } from '../lib/command.ts';
import { inspectPrototype } from '../lib/inspect.ts';
import { mark } from '../lib/output.ts';
import { resolveTarget } from '../lib/workspace.ts';

export const SNAPSHOT_FILE_SUFFIX = '.protoyard.json';

interface SnapshotFileReport {
  file: string;
  ok: boolean;
  name?: string;
  scenarioId?: string | null;
  createdAt?: string;
  rows?: number;
  warnings: string[];
  error?: string;
}

export const snapshotListCommand: Handler = async (ctx, args): Promise<CommandResult> => {
  const { entry, dir } = await resolveTarget(ctx, args[0]);
  const folder = join(dir, 'snapshots');
  let files: string[] = [];
  try {
    files = (await readdir(folder)).filter((f) => f.endsWith(SNAPSHOT_FILE_SUFFIX)).sort();
  } catch {
    // no snapshots folder
  }

  // Table names make "unknown table" warnings precise; without a loadable
  // definition we still validate the schema, prototype id and version.
  let tables: string[] | null = null;
  if (files.length > 0) {
    try {
      tables = [
        ...Object.keys(RESERVED_TABLES),
        ...(await inspectPrototype(ctx.root, dir, 'inspect')).tables,
      ];
    } catch {
      tables = null;
    }
  }

  const reports: SnapshotFileReport[] = [];
  for (const file of files) {
    const path = join(folder, file);
    if ((await stat(path)).size > SNAPSHOT_MAX_BYTES) {
      reports.push({ file, ok: false, warnings: [], error: 'larger than 25 MB' });
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      reports.push({ file, ok: false, warnings: [], error: 'not valid JSON' });
      continue;
    }
    const knownTables =
      tables ??
      ((json as { tables?: { name?: unknown }[] }).tables ?? []).map((t) => String(t.name ?? ''));
    const result = validateSnapshot(json, {
      prototypeId: entry.id,
      schemaVersion: entry.schemaVersion,
      tables: knownTables,
    });
    reports.push(
      result.ok
        ? {
            file,
            ok: true,
            name: result.snapshot.name,
            scenarioId: result.snapshot.scenarioId,
            createdAt: result.snapshot.createdAt,
            rows: result.snapshot.tables.reduce((sum, t) => sum + t.rows.length, 0),
            warnings: result.warnings,
          }
        : { file, ok: false, warnings: [], error: result.error }
    );
  }

  return {
    data: {
      slug: entry.slug,
      folder: `${entry.path}/snapshots`,
      files: reports,
      tablesKnown: tables !== null,
    },
    render(out) {
      const { c } = out;
      out.info(
        c.dim(
          "Snapshots you save in DevTools live in that browser's IndexedDB for this prototype. Export one as JSON\n" +
            `and commit it under ${entry.path}/snapshots/<name>${SNAPSHOT_FILE_SUFFIX} to share it; it is listed here.`
        )
      );
      if (reports.length === 0) {
        out.always(`No committed snapshot files in ${entry.path}/snapshots/.`);
        return;
      }
      for (const r of reports) {
        if (r.ok) {
          out.always(
            `${mark(c, 'pass')} ${r.file}  ${c.bold(r.name ?? '')} ${c.dim(`${r.rows} rows · scenario ${r.scenarioId ?? '—'} · ${r.createdAt}`)}`
          );
          for (const w of r.warnings) out.always(`    ${c.yellow(w)}`);
        } else {
          out.always(`${mark(c, 'fail')} ${r.file}  ${c.red(r.error ?? 'invalid')}`);
        }
      }
    },
  };
};
