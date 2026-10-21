import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';

/** Writes a quick artifact through an exclusive, unpredictable sibling file. */
export async function writeQuickAtomic(
  path: string,
  data: string | Buffer,
  makeId: () => string = randomUUID
): Promise<void> {
  const temp = `${path}.${makeId()}.tmp`;
  let created = false;
  try {
    await writeFile(temp, data, { flag: 'wx', mode: 0o600 });
    created = true;
    await rename(temp, path);
  } finally {
    if (created) await rm(temp, { force: true }).catch(() => undefined);
  }
}

/** Reserves a unique temporary file for a quick operation that passes it onward. */
export async function writeQuickTemp(
  path: string,
  data: string | Buffer,
  makeId: () => string = randomUUID
): Promise<string> {
  const temp = `${path}.${makeId()}.tmp`;
  await writeFile(temp, data, { flag: 'wx', mode: 0o600 });
  return temp;
}
