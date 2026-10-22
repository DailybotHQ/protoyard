/**
 * Authoring bounds for briefs and generated outlines (all four kinds).
 *
 * The brief character cap matches historical app synthesis. Slide, section,
 * block and text ceilings agree with the untrusted block contract
 * (`@protoyard/blocks` BLOCK_CONTENT_LIMITS / BLOCK_LIMITS) so a synthesizer
 * never emits drafts that the kind/block validators would reject for size.
 *
 * Oversized **briefs** are truncated with a stable notice (synthesis still
 * runs). Oversized **outline structure** yields stable diagnostics; optional
 * `truncate: true` clips deterministically instead of failing.
 */

import type { BlueprintKind } from '../kinds/kind.ts';

/** Longer briefs are cut here; synthesizers read keywords, not essays. */
export const MAX_BRIEF_LENGTH = 5_000;

/** Same cap for deck / page / doc content briefs. */
export const MAX_CONTENT_BRIEF_LENGTH = MAX_BRIEF_LENGTH;

/**
 * Outline structure and text ceilings. Numbers mirror block content limits
 * (markdown 4_000, short body 600, blocks-per-column 12) and keep generated
 * decks/pages within a practical authoring range.
 */
export const OUTLINE_LIMITS = Object.freeze({
  /** Maximum slides in one generated or agent-authored deck outline. */
  maxSlides: 64,
  /** Maximum top-level sections in a page or doc outline. */
  maxSections: 64,
  /**
   * Blocks nested under one slide or section (matches blocks-per-column
   * capacity so a slide always fits).
   */
  maxBlocksPerUnit: 12,
  /** Title / heading string length. */
  maxTitleLength: 80,
  /** Short body / bullet / card copy (block shortMarkdown). */
  maxBodyLength: 600,
  /** Long text / markdown block body (block markdown). */
  maxTextLength: 4_000,
  /** Description / rationale line on the envelope. */
  maxDescriptionLength: 280,
});

export type OutlineLimits = { [Key in keyof typeof OUTLINE_LIMITS]: number };

export type BriefLimitCode =
  | 'brief-too-long'
  | 'too-many-slides'
  | 'too-many-sections'
  | 'too-many-blocks'
  | 'title-too-long'
  | 'body-too-long'
  | 'text-too-long';

export type BriefLimitIssue = {
  code: BriefLimitCode;
  path: (string | number)[];
  message: string;
  fix: string;
  limit: number;
  actual: number;
};

export type BoundBriefInput = {
  /** Brief text ready for synthesis (never longer than the cap). */
  brief: string;
  /** True when the original was longer than the cap. */
  truncated: boolean;
  /** Original length before truncation. */
  originalLength: number;
  /** Documented notices for callers to surface (stable wording). */
  notices: string[];
};

/** One slide or section unit inside a generated outline. */
export type OutlineUnitInput = {
  id?: string;
  title?: string;
  body?: string;
  text?: string;
  blocks?: unknown[];
};

/** Structure checked before synthesis or agent draft validation. */
export type OutlineBoundsInput = {
  kind: BlueprintKind;
  title?: string;
  description?: string;
  slides?: OutlineUnitInput[];
  sections?: OutlineUnitInput[];
};

export type CheckOutlineBoundsResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: BriefLimitIssue[] };

export type ApplyOutlineBoundsResult = {
  outline: OutlineBoundsInput;
  truncated: boolean;
  notices: string[];
  issues: BriefLimitIssue[];
};

function noticeBriefTruncated(original: number, limit: number): string {
  return `Brief truncated from ${original} to ${limit} characters (MAX_BRIEF_LENGTH).`;
}

/**
 * Enforce the brief character cap. Always returns a string ≤ the limit;
 * never throws. Deterministic for the same input and limit.
 */
export function boundBriefInput(
  brief: string,
  options: { maxLength?: number } = {}
): BoundBriefInput {
  const limit = options.maxLength ?? MAX_BRIEF_LENGTH;
  const source = typeof brief === 'string' ? brief : '';
  const originalLength = source.length;
  if (originalLength <= limit) {
    return { brief: source, truncated: false, originalLength, notices: [] };
  }
  return {
    brief: source.slice(0, limit),
    truncated: true,
    originalLength,
    notices: [noticeBriefTruncated(originalLength, limit)],
  };
}

function issue(
  code: BriefLimitCode,
  path: (string | number)[],
  limit: number,
  actual: number,
  message: string,
  fix: string
): BriefLimitIssue {
  return { code, path, message, fix, limit, actual };
}

function checkString(
  value: string | undefined,
  path: (string | number)[],
  limit: number,
  code: BriefLimitCode,
  label: string
): BriefLimitIssue | null {
  if (value === undefined) return null;
  if (value.length <= limit) return null;
  return issue(
    code,
    path,
    limit,
    value.length,
    `${label} is ${value.length} characters; the limit is ${limit}.`,
    `Shorten ${label.toLowerCase()} to at most ${limit} characters.`
  );
}

function checkUnits(
  kind: BlueprintKind,
  units: OutlineUnitInput[] | undefined,
  collection: 'slides' | 'sections',
  maxUnits: number
): BriefLimitIssue[] {
  const issues: BriefLimitIssue[] = [];
  if (!units) return issues;
  if (units.length > maxUnits) {
    issues.push(
      issue(
        collection === 'slides' ? 'too-many-slides' : 'too-many-sections',
        [collection],
        maxUnits,
        units.length,
        `${kind} outline has ${units.length} ${collection}; the limit is ${maxUnits}.`,
        `Reduce ${collection} to at most ${maxUnits}.`
      )
    );
  }
  const limit = OUTLINE_LIMITS.maxBlocksPerUnit;
  units.forEach((unit, index) => {
    const pathBase: (string | number)[] = [collection, index];
    const titleIssue = checkString(
      unit.title,
      [...pathBase, 'title'],
      OUTLINE_LIMITS.maxTitleLength,
      'title-too-long',
      'Title'
    );
    if (titleIssue) issues.push(titleIssue);
    const bodyIssue = checkString(
      unit.body,
      [...pathBase, 'body'],
      OUTLINE_LIMITS.maxBodyLength,
      'body-too-long',
      'Body'
    );
    if (bodyIssue) issues.push(bodyIssue);
    const textIssue = checkString(
      unit.text,
      [...pathBase, 'text'],
      OUTLINE_LIMITS.maxTextLength,
      'text-too-long',
      'Text'
    );
    if (textIssue) issues.push(textIssue);
    const blockCount = Array.isArray(unit.blocks) ? unit.blocks.length : 0;
    if (blockCount > limit) {
      issues.push(
        issue(
          'too-many-blocks',
          [...pathBase, 'blocks'],
          limit,
          blockCount,
          `${collection.slice(0, -1)} has ${blockCount} blocks; the limit is ${limit}.`,
          `Keep at most ${limit} blocks per ${collection.slice(0, -1)}.`
        )
      );
    }
  });
  return issues;
}

/**
 * Validate an outline structure against the documented ceilings.
 * Does not mutate input. Empty collections are allowed (scaffolding).
 */
export function checkOutlineBounds(input: OutlineBoundsInput): CheckOutlineBoundsResult {
  const issues: BriefLimitIssue[] = [];
  const titleIssue = checkString(
    input.title,
    ['title'],
    OUTLINE_LIMITS.maxTitleLength,
    'title-too-long',
    'Title'
  );
  if (titleIssue) issues.push(titleIssue);
  const descriptionIssue = checkString(
    input.description,
    ['description'],
    OUTLINE_LIMITS.maxDescriptionLength,
    'body-too-long',
    'Description'
  );
  if (descriptionIssue) issues.push(descriptionIssue);

  if (input.kind === 'deck') {
    issues.push(...checkUnits('deck', input.slides, 'slides', OUTLINE_LIMITS.maxSlides));
    if (input.sections && input.sections.length > 0) {
      issues.push(
        issue(
          'too-many-sections',
          ['sections'],
          0,
          input.sections.length,
          'Deck outlines use slides, not sections.',
          'Move content into slides and omit sections.'
        )
      );
    }
  } else if (input.kind === 'page' || input.kind === 'doc') {
    issues.push(...checkUnits(input.kind, input.sections, 'sections', OUTLINE_LIMITS.maxSections));
    if (input.slides && input.slides.length > 0) {
      issues.push(
        issue(
          'too-many-slides',
          ['slides'],
          0,
          input.slides.length,
          `${input.kind} outlines use sections, not slides.`,
          'Move content into sections and omit slides.'
        )
      );
    }
  } else {
    // app: no slide/section outline; only envelope strings if present
    if (input.slides && input.slides.length > 0) {
      issues.push(
        issue(
          'too-many-slides',
          ['slides'],
          0,
          input.slides.length,
          'App briefs do not take a slide outline.',
          'Omit slides for kind app.'
        )
      );
    }
    if (input.sections && input.sections.length > 0) {
      issues.push(
        issue(
          'too-many-sections',
          ['sections'],
          0,
          input.sections.length,
          'App briefs do not take a section outline.',
          'Omit sections for kind app.'
        )
      );
    }
  }

  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}

function clipString(value: string | undefined, limit: number): string | undefined {
  if (value === undefined) return undefined;
  return value.length <= limit ? value : value.slice(0, limit);
}

function clipUnits(
  units: OutlineUnitInput[] | undefined,
  maxUnits: number
): { units: OutlineUnitInput[] | undefined; clippedUnits: number; clippedFields: number } {
  if (!units) return { units: undefined, clippedUnits: 0, clippedFields: 0 };
  let clippedFields = 0;
  const sliced = units.slice(0, maxUnits);
  const clippedUnits = units.length - sliced.length;
  const next = sliced.map((unit) => {
    const title = clipString(unit.title, OUTLINE_LIMITS.maxTitleLength);
    const body = clipString(unit.body, OUTLINE_LIMITS.maxBodyLength);
    const text = clipString(unit.text, OUTLINE_LIMITS.maxTextLength);
    if (title !== unit.title || body !== unit.body || text !== unit.text) clippedFields += 1;
    const blocks = Array.isArray(unit.blocks)
      ? unit.blocks.slice(0, OUTLINE_LIMITS.maxBlocksPerUnit)
      : unit.blocks;
    if (Array.isArray(unit.blocks) && unit.blocks.length > OUTLINE_LIMITS.maxBlocksPerUnit) {
      clippedFields += 1;
    }
    return { ...unit, title, body, text, blocks };
  });
  return { units: next, clippedUnits, clippedFields };
}

/**
 * Deterministically clip an outline to the ceilings. Prefer `checkOutlineBounds`
 * when you want hard failures; use this when synthesis should continue with a
 * documented truncation notice.
 */
export function applyOutlineBounds(input: OutlineBoundsInput): ApplyOutlineBoundsResult {
  const notices: string[] = [];
  let truncated = false;
  const outline: OutlineBoundsInput = {
    kind: input.kind,
    title: clipString(input.title, OUTLINE_LIMITS.maxTitleLength),
    description: clipString(input.description, OUTLINE_LIMITS.maxDescriptionLength),
  };
  if (outline.title !== input.title || outline.description !== input.description) {
    truncated = true;
    notices.push('Envelope title/description clipped to outline text limits.');
  }

  if (input.kind === 'deck') {
    const { units, clippedUnits, clippedFields } = clipUnits(
      input.slides,
      OUTLINE_LIMITS.maxSlides
    );
    outline.slides = units;
    if (clippedUnits > 0) {
      truncated = true;
      notices.push(
        `Slides truncated from ${(input.slides?.length ?? 0).toString()} to ${OUTLINE_LIMITS.maxSlides}.`
      );
    }
    if (clippedFields > 0) {
      truncated = true;
      notices.push('Slide titles, bodies or blocks clipped to outline limits.');
    }
  } else if (input.kind === 'page' || input.kind === 'doc') {
    const { units, clippedUnits, clippedFields } = clipUnits(
      input.sections,
      OUTLINE_LIMITS.maxSections
    );
    outline.sections = units;
    if (clippedUnits > 0) {
      truncated = true;
      notices.push(
        `Sections truncated from ${(input.sections?.length ?? 0).toString()} to ${OUTLINE_LIMITS.maxSections}.`
      );
    }
    if (clippedFields > 0) {
      truncated = true;
      notices.push('Section titles, bodies or blocks clipped to outline limits.');
    }
  }

  // Re-check so callers always get a full issue list for anything still wrong
  // (e.g. deck with leftover sections field).
  const checked = checkOutlineBounds(outline);
  return {
    outline,
    truncated,
    notices,
    issues: checked.ok ? [] : checked.issues,
  };
}

/**
 * Convenience for synthesizers: bound the brief, then return source + notices.
 * Same behavior as historical `brief.slice(0, MAX_BRIEF_LENGTH)`.
 */
export function prepareBriefForSynthesis(
  brief: string,
  options: { maxLength?: number } = {}
): BoundBriefInput {
  return boundBriefInput(brief, options);
}
