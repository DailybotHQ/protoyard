import {
  createRuntimeId,
  type PrototypeRuntime,
  parseInput,
  type Row,
  ValidationError,
} from '@protoyard/core';
import { z } from 'zod';
import {
  type Blueprint,
  type BlueprintEntity,
  type BlueprintField,
  entityTable,
} from './schema.ts';
import { FEATURE_TABLES, relationProperty } from './storage.ts';
import { fieldLabel } from './validation.ts';

export const DEFAULT_FILE_QUOTA_BYTES = 50 * 1024 * 1024;

const UploadInputSchema = z.strictObject({
  entity: z.string().min(1),
  recordId: z.string().min(1),
  field: z.string().min(1),
  name: z.string().min(1).max(255).optional(),
});

export interface FileUploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface BlueprintFileMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  ownerId: string;
  entity: string;
  recordId: string;
  createdAt: string;
}

export interface BlueprintFile extends BlueprintFileMetadata {
  blob: Blob;
}

export interface FileService {
  upload(
    input: unknown,
    onProgress?: (progress: FileUploadProgress) => void
  ): Promise<BlueprintFileMetadata>;
  list(entityName: string, recordId: string, fieldName?: string): Promise<BlueprintFileMetadata[]>;
  get(id: string): Promise<BlueprintFile | undefined>;
  remove(id: string): Promise<boolean>;
}

export type FileServices = Record<string, FileService>;

interface Table {
  get(id: string): Promise<Row | undefined>;
  toArray(): Promise<Row[]>;
  put(row: Row): Promise<unknown>;
  delete(id: string): Promise<unknown>;
  update(id: string, patch: Record<string, unknown>): Promise<unknown>;
}

interface Db {
  table(name: string): Table;
  transaction<T>(mode: 'rw', tables: string[], fn: () => Promise<T>): Promise<T>;
}

export class FileUploadError extends Error {
  readonly code:
    | 'not-found'
    | 'size-limit'
    | 'type-not-allowed'
    | 'quota-exceeded'
    | 'files-disabled'
    | 'data-unavailable';

  constructor(code: FileUploadError['code'], message: string) {
    super(message);
    this.name = 'FileUploadError';
    this.code = code;
  }
}

function asMetadata(row: Row): BlueprintFileMetadata {
  const { blob: _blob, ...metadata } = row;
  return metadata as unknown as BlueprintFileMetadata;
}

function accepts(field: Extract<BlueprintField, { kind: 'file' }>, type: string): boolean {
  if (field.accept.length === 0) return true;
  const mime = type.toLowerCase();
  return field.accept.some((pattern) => {
    const accepted = pattern.toLowerCase();
    return accepted.endsWith('/*') ? mime.startsWith(accepted.slice(0, -1)) : mime === accepted;
  });
}

function assertUpdateAllowed(runtime: PrototypeRuntime, entity: BlueprintEntity, row: Row) {
  const capability = `${entity.name}:update`;
  const owner = entity.ownerField
    ? entity.fields.find((field) => field.name === entity.ownerField)
    : undefined;
  const ownerId = owner ? row[relationProperty(owner) ?? owner.name] : undefined;
  if (
    runtime.session.can(capability, row) ||
    (typeof ownerId === 'string' && runtime.session.can(`${entity.name}:update:own`, row))
  ) {
    return;
  }
  runtime.session.assert(capability, row);
}

function entityMap(blueprint: Blueprint) {
  return new Map(blueprint.entities.map((entity) => [entity.name, entity]));
}

export function createFileServices(
  runtime: PrototypeRuntime,
  blueprint: Blueprint,
  options: { prototypeQuotaBytes?: number } = {}
): FileServices {
  const db = runtime.db as Db;
  const files = db.table(FEATURE_TABLES.files);
  const entities = entityMap(blueprint);
  const quotaLimit = parseInput(
    z.number().int().nonnegative(),
    options.prototypeQuotaBytes ?? DEFAULT_FILE_QUOTA_BYTES
  );

  function fileField(entity: BlueprintEntity, fieldName: string) {
    const field = entity.fields.find((candidate) => candidate.name === fieldName);
    if (field?.kind !== 'file') {
      throw new ValidationError({ [fieldName]: 'Choose a file field on this entity' });
    }
    return field;
  }

  function getEntity(entityName: string) {
    const entity = entities.get(entityName);
    if (!entity)
      throw new FileUploadError('not-found', `No blueprint entity named "${entityName}".`);
    if (!entity.features.files) {
      throw new FileUploadError('files-disabled', `File uploads are disabled for "${entityName}".`);
    }
    return entity;
  }

  function actorId() {
    const id = runtime.session.principal()?.persona.id;
    if (!id) throw new Error('No active persona. Load a scenario first.');
    return id;
  }

  async function assertQuota(size: number) {
    const stored = await files.toArray();
    const prototypeUsage = stored.reduce((total, row) => {
      const rowSize = row.size;
      if (typeof rowSize !== 'number' || !Number.isSafeInteger(rowSize) || rowSize < 0) {
        throw new FileUploadError(
          'quota-exceeded',
          'Stored file metadata exceeds the available quota.'
        );
      }
      return total + rowSize;
    }, 0);
    const storage = runtime.storage();
    const browserRemaining =
      storage.quotaBytes === undefined || storage.usageBytes === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(0, storage.quotaBytes - storage.usageBytes);
    const limit = Math.min(quotaLimit, storage.quotaBytes ?? quotaLimit);
    if (prototypeUsage + size > limit || size > browserRemaining) {
      throw new FileUploadError(
        'quota-exceeded',
        'This prototype does not have enough storage quota for that file.'
      );
    }
  }

  async function record(entity: BlueprintEntity, recordId: string) {
    const row = await db.table(entityTable(entity)).get(recordId);
    if (!row || row.deletedAt)
      throw new FileUploadError('not-found', `No ${entity.name} with id "${recordId}".`);
    assertUpdateAllowed(runtime, entity, row);
    return row;
  }

  async function readRecord(entity: BlueprintEntity, recordId: string) {
    const row = await db.table(entityTable(entity)).get(recordId);
    if (!row || row.deletedAt)
      throw new FileUploadError('not-found', `No ${entity.name} with id "${recordId}".`);
    runtime.session.assert(`${entity.name}:read`, row);
    return row;
  }

  const serviceFor = (entity: BlueprintEntity): FileService => ({
    async upload(input, onProgress) {
      if (!entity.features.files) {
        throw new FileUploadError(
          'files-disabled',
          `File uploads are disabled for "${entity.name}".`
        );
      }
      const recordInput =
        typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
      const { file: candidate, ...metadataInput } = recordInput;
      if (typeof recordInput.recordId !== 'string') {
        throw new ValidationError({ recordId: 'Choose a record' });
      }
      const current = await record(entity, recordInput.recordId);
      const data = parseInput(UploadInputSchema, metadataInput);
      if (typeof Blob === 'undefined' || !(candidate instanceof Blob)) {
        throw new ValidationError({ file: 'Choose a file to upload' });
      }
      if (data.entity !== entity.name) {
        throw new ValidationError({ entity: `Use the ${entity.name} file service` });
      }
      const field = fileField(entity, data.field);
      const file = candidate;
      const name = data.name ?? (file as Blob & { name?: string }).name ?? 'upload';
      if (file.size > field.maxSizeBytes) {
        throw new FileUploadError(
          'size-limit',
          `${fieldLabel(field)} must be at most ${field.maxSizeBytes} bytes.`
        );
      }
      if (!accepts(field, file.type)) {
        throw new FileUploadError(
          'type-not-allowed',
          `${fieldLabel(field)} does not accept ${file.type || 'an unknown file type'}.`
        );
      }
      await assertQuota(file.size);
      const id = createRuntimeId('file');
      const ownerId = actorId();
      const property = relationProperty(field) as string;
      const oldIds = field.multiple
        ? ((current[property] as string[] | undefined) ?? [])
        : typeof current[property] === 'string'
          ? [current[property] as string]
          : [];
      const nextIds = field.multiple ? [...new Set([...oldIds, id])] : [id];
      const metadata: BlueprintFileMetadata = {
        id,
        name,
        type: file.type,
        size: file.size,
        ownerId,
        entity: entity.name,
        recordId: data.recordId,
        createdAt: runtime.clock.now().toISOString(),
      };

      onProgress?.({ loaded: 0, total: file.size, percent: 0 });
      return runtime.environment.run('files.upload', async () => {
        onProgress?.({ loaded: Math.floor(file.size / 2), total: file.size, percent: 50 });
        // Keep binary bytes in IndexedDB; the service reconstructs a Blob on demand.
        const storedBytes = await file.arrayBuffer();
        await db.transaction(
          'rw',
          [entityTable(entity), FEATURE_TABLES.files, 'py_personas'],
          async () => {
            await record(entity, data.recordId);
            await assertQuota(file.size);
            if (!field.multiple) {
              for (const oldId of oldIds) await files.delete(oldId);
            }
            await files.put({ ...metadata, blob: storedBytes } as unknown as Row);
            await db.table(entityTable(entity)).update(data.recordId, {
              [property]: field.multiple ? nextIds : id,
              updatedAt: runtime.clock.now().toISOString(),
            });
          }
        );
        onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
        return metadata;
      });
    },

    async list(entityName, recordId, fieldName) {
      const targetEntity = getEntity(entityName);
      if (targetEntity.name !== entity.name)
        throw new ValidationError({ entity: 'Use the matching file service' });
      const row = await readRecord(targetEntity, recordId);
      const selectedFields = targetEntity.fields.filter(
        (field) => field.kind === 'file' && (!fieldName || field.name === fieldName)
      );
      const ids = new Set(
        selectedFields.flatMap((field) => {
          const value = row[relationProperty(field) as string];
          return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
        })
      );
      const all = await files.toArray();
      return all.filter((file) => ids.has(file.id as string)).map(asMetadata);
    },

    async get(id) {
      if (!entity.features.files) {
        throw new FileUploadError(
          'files-disabled',
          `File uploads are disabled for "${entity.name}".`
        );
      }
      const file = await files.get(id);
      if (!file || file.entity !== entity.name) return undefined;
      const target = getEntity(entity.name);
      await readRecord(target, file.recordId as string);
      const storedBlob = file.blob;
      let blob: Blob;
      if (typeof Blob !== 'undefined' && storedBlob instanceof Blob) {
        blob = storedBlob;
      } else if (storedBlob instanceof ArrayBuffer) {
        blob = new Blob([storedBlob], { type: file.type as string });
      } else {
        throw new FileUploadError(
          'data-unavailable',
          'This attachment has no binary data. File contents are not preserved in JSON snapshots.'
        );
      }
      return { ...file, blob } as unknown as BlueprintFile;
    },

    async remove(id) {
      if (!entity.features.files) {
        throw new FileUploadError(
          'files-disabled',
          `File uploads are disabled for "${entity.name}".`
        );
      }
      const file = await files.get(id);
      if (!file || file.entity !== entity.name) return false;
      const target = getEntity(entity.name);
      const row = await record(target, file.recordId as string);
      const matchingField = target.fields.find(
        (candidate) =>
          candidate.kind === 'file' &&
          (Array.isArray(row[relationProperty(candidate) as string])
            ? (row[relationProperty(candidate) as string] as string[]).includes(id)
            : row[relationProperty(candidate) as string] === id)
      );
      if (!matchingField) return false;
      const property = relationProperty(matchingField) as string;
      const fileFieldSchema = matchingField;
      return runtime.environment.run('files.remove', () =>
        db.transaction('rw', [entityTable(target), FEATURE_TABLES.files], async () => {
          const latest = await record(target, file.recordId as string);
          const value = latest[property];
          await files.delete(id);
          await db.table(entityTable(target)).update(file.recordId as string, {
            [property]:
              fileFieldSchema?.kind === 'file' && fileFieldSchema.multiple
                ? Array.isArray(value)
                  ? value.filter((fileId) => fileId !== id)
                  : []
                : null,
            updatedAt: runtime.clock.now().toISOString(),
          });
          return true;
        })
      );
    },
  });

  return Object.fromEntries(blueprint.entities.map((entity) => [entity.name, serviceFor(entity)]));
}
