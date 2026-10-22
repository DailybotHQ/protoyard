/** Read the `@prop` declarations embedded in a demo component's source. */
export type PropRow = { name: string; type: string; description: string };

export function propsFromSource(source: string): PropRow[] {
  const rows: PropRow[] = [];
  const matcher = /@prop\s+([a-z][\w-]*)\s*:\s*([^—\n]+?)\s+—\s*(.+?)(?:\s*-->|\s*\*\/)/g;
  for (const match of source.matchAll(matcher)) {
    const [, name, type, description] = match;
    if (name && type && description)
      rows.push({ name, type: type.trim(), description: description.trim() });
  }
  return rows;
}
