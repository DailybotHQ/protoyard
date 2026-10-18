import type { PrototypeRuntime } from '@protoyard/core';
import type { Blueprint, BlueprintEntity, BlueprintField } from './schema.ts';
import { createEntityServices } from './services.ts';
import { inputProperty } from './validation.ts';

export interface EntitySearchMatch {
  entityName: string;
  entityLabel: string;
  recordId: string;
  title: string;
  matchedFields: string[];
  titleMatch: boolean;
}

export interface SearchEntitiesOptions {
  /** Maximum number of results returned for each readable entity. Defaults to 10. */
  limitPerEntity?: number;
}

interface RankedMatch extends EntitySearchMatch {
  normalizedTitle: string;
  exactTitleMatch: boolean;
  titlePrefixMatch: boolean;
}

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

function searchableText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is string | number | boolean =>
          typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
      )
      .map(String)
      .join(' ');
  }
  return '';
}

function entityLabel(entity: BlueprintEntity): string {
  return (
    entity.label ??
    entity.name.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function fieldMap(entity: BlueprintEntity): Map<string, BlueprintField> {
  return new Map(entity.fields.map((field) => [field.name, field]));
}

function compareMatches(left: RankedMatch, right: RankedMatch): number {
  return (
    Number(right.titleMatch) - Number(left.titleMatch) ||
    Number(right.exactTitleMatch) - Number(left.exactTitleMatch) ||
    Number(right.titlePrefixMatch) - Number(left.titlePrefixMatch) ||
    (left.entityName < right.entityName ? -1 : left.entityName > right.entityName ? 1 : 0) ||
    (left.normalizedTitle < right.normalizedTitle
      ? -1
      : left.normalizedTitle > right.normalizedTitle
        ? 1
        : 0) ||
    (left.recordId < right.recordId ? -1 : left.recordId > right.recordId ? 1 : 0)
  );
}

/** Searches every readable entity using its title field and declared searchable fields. */
export async function searchEntities(
  runtime: PrototypeRuntime,
  blueprint: Blueprint,
  query: string,
  options: SearchEntitiesOptions = {}
): Promise<EntitySearchMatch[]> {
  const normalizedQuery = normalize(query.trim());
  if (!normalizedQuery) return [];

  const requestedLimit = options.limitPerEntity ?? 10;
  const limitPerEntity = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.floor(requestedLimit))
    : 10;
  if (limitPerEntity === 0) return [];

  const services = createEntityServices(runtime, blueprint);
  const entityMatches = await Promise.all(
    blueprint.entities.map(async (entity): Promise<RankedMatch[]> => {
      const capability = `${entity.name}:read`;
      if (!runtime.session.can(capability)) return [];

      const service = services[entity.name];
      if (!service) return [];
      const rows = await service.list();
      const hasRecordReadRule = Boolean(runtime.policy.definition.rules?.[capability]);
      const fields = fieldMap(entity);
      const searchableNames = [...new Set([entity.titleField, ...entity.searchable])];
      const titleField = fields.get(entity.titleField);
      const matches: RankedMatch[] = [];

      for (const row of rows) {
        if (hasRecordReadRule && !runtime.session.can(capability, row)) continue;
        const title = searchableText(titleField ? row[inputProperty(titleField)] : '').trim();
        const normalizedTitle = normalize(title);
        const matchedFields: string[] = [];

        for (const fieldName of searchableNames) {
          const field = fields.get(fieldName);
          if (!field) continue;
          const value = normalize(searchableText(row[inputProperty(field)]));
          if (value.includes(normalizedQuery)) matchedFields.push(fieldName);
        }
        if (matchedFields.length === 0) continue;

        matches.push({
          entityName: entity.name,
          entityLabel: entityLabel(entity),
          recordId: row.id,
          title: title || row.id,
          matchedFields,
          titleMatch: matchedFields.includes(entity.titleField),
          normalizedTitle,
          exactTitleMatch: normalizedTitle === normalizedQuery,
          titlePrefixMatch: normalizedTitle.startsWith(normalizedQuery),
        });
      }

      return matches.sort(compareMatches).slice(0, limitPerEntity);
    })
  );

  return entityMatches
    .flat()
    .sort(compareMatches)
    .map(
      ({
        normalizedTitle: _normalizedTitle,
        exactTitleMatch: _exactTitleMatch,
        titlePrefixMatch: _titlePrefixMatch,
        ...match
      }) => match
    );
}
