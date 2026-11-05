/**
 * Child-process runner: imports ONE local module that exports a Protoyard
 * `Theme` (a prototype's own `src/theme.ts`, for example) under tsx and
 * prints that theme as JSON. Used by `protoyard ds new --from-theme-file`.
 *
 * This executes workspace code, so it is only for trusted files in your own
 * workspace (the same trust level as `pnpm test`). The CLI validates the
 * printed JSON with `ThemeSchema` before it uses it.
 *
 *   tsx load-theme.ts <file> [exportName]
 *
 * Without an export name it takes the default export, then an export named
 * `theme`, then the only export that looks like a theme (`light` and `dark`
 * palettes). Output: one marker line followed by JSON on stdout.
 */
import { pathToFileURL } from 'node:url';

const RESULT_MARKER = '@@PROTOYARD_RESULT@@';

function looksLikeTheme(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const theme = value as Record<string, unknown>;
  return (
    typeof theme.id === 'string' &&
    typeof theme.light === 'object' &&
    theme.light !== null &&
    typeof theme.dark === 'object' &&
    theme.dark !== null
  );
}

function pick(
  exports: Record<string, unknown>,
  name: string | undefined
): { theme?: unknown; error?: string } {
  if (name) {
    if (!(name in exports)) return { error: `The file has no export named "${name}".` };
    return { theme: exports[name] };
  }
  if (looksLikeTheme(exports.default)) return { theme: exports.default };
  if (looksLikeTheme(exports.theme)) return { theme: exports.theme };
  const themes = Object.entries(exports).filter(([, value]) => looksLikeTheme(value));
  if (themes.length === 1) return { theme: themes[0]?.[1] };
  if (themes.length === 0)
    return { error: 'The file exports no theme (an object with id, light and dark).' };
  return {
    error: `The file exports ${themes.length} themes (${themes.map(([key]) => key).join(', ')}); pass --export <name>.`,
  };
}

async function main(): Promise<void> {
  const [file, name] = process.argv.slice(2);
  if (!file) throw new Error('Usage: load-theme.ts <file> [exportName]');
  const exports = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  const result = pick(exports, name);
  process.stdout.write(
    `\n${RESULT_MARKER}\n${JSON.stringify(result.error ? { fatal: result.error } : { theme: result.theme })}\n`
  );
}

main().catch((error: unknown) => {
  process.stdout.write(
    `\n${RESULT_MARKER}\n${JSON.stringify({ fatal: error instanceof Error ? error.message : String(error) })}\n`
  );
});
