import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { latestSchemaVersion, safeParseBlueprint } from '@protoyard/blueprint';
import type { CommandResult, Handler } from '../lib/command.ts';
import { CliError, mark } from '../lib/output.ts';

/**
 * `protoyard blueprint validate <file>`: checks a blueprint without
 * generating anything. Exit 0 when valid, 4 with every path-specific issue
 * otherwise. Reads JSON only.
 */
export const blueprintValidateCommand: Handler = async (_ctx, args): Promise<CommandResult> => {
  const file = args[0];
  if (!file) {
    throw new CliError('usage', 'Missing <file>.', {
      hint: 'Example: pnpm protoyard blueprint validate ./helpdesk.blueprint.json',
    });
  }
  const path = resolve(process.cwd(), file);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new CliError('not_found', `Blueprint file not found: ${file}`);
  if (info.size > 1024 * 1024) {
    throw new CliError('validation', `Blueprint file is larger than 1 MB: ${file}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new CliError('validation', `Blueprint is not valid JSON: ${(error as Error).message}`, {
      data: { file, valid: false, issues: [{ path: '(root)', message: (error as Error).message }] },
    });
  }
  const parsed = safeParseBlueprint(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.') || '(root)',
      message: issue.message,
    }));
    throw new CliError(
      'validation',
      `Invalid blueprint (${issues.length} issue${issues.length === 1 ? '' : 's'}): ${issues
        .map((i) => `${i.path} — ${i.message}`)
        .join('; ')}`,
      { data: { file, valid: false, issues } }
    );
  }
  const blueprint = parsed.data;
  let schemaVersion: number;
  try {
    schemaVersion = latestSchemaVersion(blueprint);
  } catch (error) {
    throw new CliError(
      'validation',
      `Blueprint history does not rebuild: ${(error as Error).message}`,
      {
        data: {
          file,
          valid: false,
          issues: [{ path: 'history', message: (error as Error).message }],
        },
      }
    );
  }
  const entities = blueprint.entities.map((e) => ({
    name: e.name,
    fields: e.fields.length,
  }));
  return {
    data: {
      file,
      valid: true,
      name: blueprint.name,
      entities,
      roles: blueprint.roles.map((r) => r.name),
      screens: blueprint.screens.length,
      schemaVersion,
      issues: [],
    },
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} ${c.bold(blueprint.name)} is a valid blueprint: ${entities.length} entities, ${blueprint.roles.length} roles, schema v${schemaVersion}`
      );
      for (const e of entities) out.info(`  ${e.name} ${c.dim(`(${e.fields} fields)`)}`);
    },
  };
};
