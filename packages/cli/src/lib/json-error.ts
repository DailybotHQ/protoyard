/**
 * The text of a `JSON.parse` failure on an untrusted file, without its
 * contents. Node's messages quote the start of the input
 * (`Unexpected token 'A', "API_KEY=sk"... is not valid JSON`), so passing
 * `error.message` through would leak a prefix of any workspace file (an
 * `.env`, say) into the output and over MCP. Only the numeric position, when
 * the engine reports one, is kept.
 */
export function jsonErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const position = /\bposition (\d{1,12})\b/.exec(message)?.[1];
  if (position !== undefined) return `not valid JSON (at position ${position})`;
  if (/end of (?:JSON )?input/i.test(message)) return 'not valid JSON (it ends early)';
  return 'not valid JSON';
}
