import { z } from 'zod';
import { MESSAGE_LIMITS as L } from './limits.ts';
import {
  ATTACHMENT_URL_MESSAGES,
  attachmentUrlIssue,
  isSafeLinkUrl,
  isSafePreviewUrl,
} from './urls.ts';

/**
 * A versioned chat message AST (`protoyard.message@1`): text, buttons,
 * selects, forms, tables and link previews, plus local attachments. It is the
 * message protocol between a (simulated) agent and a chat UI, not an assistant
 * answer (that is `@protoyard/ai/markdown`). Every value is data: strings are
 * shown as text (a text block may opt into the safe markdown subset), links
 * are checked here, and markup is refused rather than escaped later.
 */
export const MESSAGE_FORMAT = 'protoyard.message@1';
export const MESSAGE_FORMAT_PREFIX = 'protoyard.message@';

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
const CONTROL_EXCEPT_NEWLINE_TAB = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
/** An HTML tag, comment, doctype or processing instruction anywhere in the string. */
// A tag name follows `<` (or `</`) directly, as browsers parse it: `a < b` is not markup.
const MARKUP = /<\/?[a-z][a-z0-9-]*(?=[\s/>])[^>]*>?|<!--|<!\[cdata\[|<!doctype|<\?/i;

/** Why a string is refused as message text, or `null`. Exported for renderers and tests. */
export function textIssue(value: string, multiline = false): string | null {
  if ((multiline ? CONTROL_EXCEPT_NEWLINE_TAB : CONTROL).test(value)) {
    return multiline
      ? 'Remove control characters (only newlines and tabs are allowed).'
      : 'Remove control characters and line breaks.';
  }
  if (BIDI.test(value)) return 'Remove bidirectional control characters.';
  if (MARKUP.test(value))
    return 'Markup is not allowed: send plain text (or markdown in a text block).';
  return null;
}

function text(max: number, options: { multiline?: boolean; min?: number } = {}) {
  return z
    .string()
    .min(options.min ?? 1)
    .max(max)
    .superRefine((value, ctx) => {
      const issue = textIssue(value, options.multiline);
      if (issue) ctx.addIssue({ code: 'custom', message: issue });
    });
}

const label = () => text(L.maxLabelLength);
const description = () => text(L.maxDescriptionLength, { multiline: true });
const actionId = () =>
  z
    .string()
    .min(1)
    .max(L.maxActionLength)
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/,
      'Use letters, digits, ".", ":", "_" or "-" (no spaces).'
    );

const linkUrl = z
  .string()
  .max(L.maxUrlLength)
  .refine(isSafeLinkUrl, 'Links must be absolute http(s) or mailto: URLs without credentials.');

const localImageUrl = z.string().superRefine((value, ctx) => {
  const issue = attachmentUrlIssue(value);
  if (issue) ctx.addIssue({ code: 'custom', message: ATTACHMENT_URL_MESSAGES[issue] });
});

/** Every block may carry a plain-text `fallback` for clients that cannot render it. */
const base = { fallback: label().optional() };

function unique<T>(items: readonly T[], key: (item: T) => string): number | null {
  const seen = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const value = key(items[index] as T);
    if (seen.has(value)) return index;
    seen.add(value);
  }
  return null;
}

export const TextBlockSchema = z.strictObject({
  ...base,
  type: z.literal('text'),
  text: text(L.maxTextLength, { multiline: true }),
  /** `markdown` renders through the safe markdown subset; default `plain`. */
  format: z.enum(['plain', 'markdown']).default('plain'),
  /** Set by the parser when this block replaced an unknown one. */
  replaces: label().optional(),
});

const ConfirmSchema = z.strictObject({
  title: label(),
  body: description(),
  confirmLabel: label(),
  cancelLabel: label(),
});

export const MessageButtonSchema = z
  .strictObject({
    label: label(),
    /** What the host receives when the button is pressed. */
    action: actionId().optional(),
    value: text(L.maxActionLength).optional(),
    /** Opens in a new tab (`noopener`); a link button has no action. */
    url: linkUrl.optional(),
    style: z.enum(['default', 'primary', 'danger']).default('default'),
    confirm: ConfirmSchema.optional(),
  })
  .superRefine((button, ctx) => {
    if (Boolean(button.action) === Boolean(button.url)) {
      ctx.addIssue({
        code: 'custom',
        path: ['action'],
        message: 'A button has exactly one of "action" or "url".',
      });
    }
    if (button.url && (button.value !== undefined || button.confirm)) {
      ctx.addIssue({
        code: 'custom',
        path: [button.value !== undefined ? 'value' : 'confirm'],
        message: 'A link button cannot carry a value or a confirmation.',
      });
    }
  });

export const ButtonsBlockSchema = z.strictObject({
  ...base,
  type: z.literal('buttons'),
  buttons: z.array(MessageButtonSchema).min(1).max(L.maxButtons),
});

export const MessageOptionSchema = z.strictObject({
  value: text(L.maxActionLength),
  label: label(),
  description: description().optional(),
});

function optionsCheck(
  options: readonly { value: string }[],
  ctx: z.RefinementCtx,
  path: (string | number)[]
) {
  const duplicate = unique(options, (option) => option.value);
  if (duplicate !== null) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, duplicate, 'value'],
      message: 'Option values must be unique.',
    });
  }
}

export const SelectBlockSchema = z
  .strictObject({
    ...base,
    type: z.literal('select'),
    action: actionId(),
    label: label().optional(),
    placeholder: label(),
    options: z.array(MessageOptionSchema).min(1).max(L.maxOptions),
    multiple: z.boolean().default(false),
    initial: z.array(text(L.maxActionLength)).max(L.maxOptions).optional(),
  })
  .superRefine((block, ctx) => {
    optionsCheck(block.options, ctx, ['options']);
    const values = new Set(block.options.map((option) => option.value));
    block.initial?.forEach((value, index) => {
      if (!values.has(value)) {
        ctx.addIssue({
          code: 'custom',
          path: ['initial', index],
          message: `"${value}" is not one of the options.`,
        });
      }
    });
    if (!block.multiple && (block.initial?.length ?? 0) > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['initial'],
        message: 'A single select has at most one initial value.',
      });
    }
  });

export const FORM_FIELD_KINDS = [
  'text',
  'textarea',
  'number',
  'date',
  'checkbox',
  'select',
  'multiselect',
] as const;
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const FormFieldSchema = z
  .strictObject({
    key: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'Use a letter, then letters, digits or "_" (max 40).'),
    label: label(),
    kind: z.enum(FORM_FIELD_KINDS),
    required: z.boolean().default(false),
    placeholder: label().optional(),
    options: z.array(MessageOptionSchema).min(1).max(L.maxOptions).optional(),
    initial: z
      .union([
        text(L.maxTextLength, { multiline: true, min: 0 }),
        z.number().finite(),
        z.boolean(),
        z.array(text(L.maxActionLength)).max(L.maxOptions),
      ])
      .optional(),
  })
  .superRefine((field, ctx) => {
    const choice = field.kind === 'select' || field.kind === 'multiselect';
    if (choice && !field.options) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `A ${field.kind} field needs options.`,
      });
    }
    if (!choice && field.options) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `A ${field.kind} field takes no options.`,
      });
    }
    if (field.options) optionsCheck(field.options, ctx, ['options']);
    if (field.initial === undefined) return;
    const values = new Set(field.options?.map((option) => option.value) ?? []);
    const initial = field.initial;
    const ok = (() => {
      switch (field.kind) {
        case 'text':
          return typeof initial === 'string' && !initial.includes('\n');
        case 'textarea':
          return typeof initial === 'string';
        case 'number':
          return typeof initial === 'number';
        case 'checkbox':
          return typeof initial === 'boolean';
        case 'date':
          return typeof initial === 'string' && ISO_DATE.test(initial);
        case 'select':
          return typeof initial === 'string' && values.has(initial);
        case 'multiselect':
          return Array.isArray(initial) && initial.every((value) => values.has(value));
      }
    })();
    if (!ok) {
      ctx.addIssue({
        code: 'custom',
        path: ['initial'],
        message: `The initial value does not fit a ${field.kind} field.`,
      });
    }
  });

export const FormBlockSchema = z
  .strictObject({
    ...base,
    type: z.literal('form'),
    action: actionId(),
    title: label(),
    fields: z.array(FormFieldSchema).min(1).max(L.maxFormFields),
    submitLabel: label().optional(),
  })
  .superRefine((block, ctx) => {
    const duplicate = unique(block.fields, (field) => field.key);
    if (duplicate !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields', duplicate, 'key'],
        message: 'Field keys must be unique.',
      });
    }
  });

const CellSchema = z.union([
  text(L.maxCellLength, { min: 0 }),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const TableBlockSchema = z
  .strictObject({
    ...base,
    type: z.literal('table'),
    title: label().optional(),
    columns: z
      .array(
        z.strictObject({
          key: z
            .string()
            .regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'Use a letter, then letters, digits or "_".'),
          header: label(),
          align: z.enum(['start', 'center', 'end']).default('start'),
        })
      )
      .min(1)
      .max(L.maxTableColumns),
    rows: z.array(z.record(z.string(), CellSchema)).max(L.maxTableRows),
  })
  .superRefine((block, ctx) => {
    const duplicate = unique(block.columns, (column) => column.key);
    if (duplicate !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['columns', duplicate, 'key'],
        message: 'Column keys must be unique.',
      });
    }
    const keys = new Set(block.columns.map((column) => column.key));
    block.rows.forEach((row, index) => {
      for (const key of Object.keys(row)) {
        if (!keys.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['rows', index, key],
            message: `"${key}" is not a declared column.`,
          });
        }
      }
    });
  });

export const LinkPreviewBlockSchema = z.strictObject({
  ...base,
  type: z.literal('link_preview'),
  /** The page; the client never fetches it. */
  url: z
    .string()
    .max(L.maxUrlLength)
    .refine(
      isSafePreviewUrl,
      'A link preview points at an absolute http(s) URL without credentials.'
    ),
  title: label().optional(),
  description: description().optional(),
  siteName: label().optional(),
  /** A local image only (attachment rules): previews never load remote media. */
  image: localImageUrl.optional(),
});

export const MessageBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ButtonsBlockSchema,
  SelectBlockSchema,
  FormBlockSchema,
  TableBlockSchema,
  LinkPreviewBlockSchema,
]);

/** Block types this version renders; anything else degrades to a text block. */
export const MESSAGE_BLOCK_TYPES = [
  'text',
  'buttons',
  'select',
  'form',
  'table',
  'link_preview',
] as const;
export type MessageBlockType = (typeof MESSAGE_BLOCK_TYPES)[number];

/** MIME types an attachment may declare. */
export const ATTACHMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export const MessageAttachmentSchema = z
  .strictObject({
    id: actionId(),
    /** A file name, never a path. */
    name: text(L.maxFileNameLength).refine(
      (name) => !/[/\\]/.test(name) && name !== '.' && name !== '..',
      'A file name cannot contain "/" or "\\".'
    ),
    mime: z.enum(ATTACHMENT_MIME_TYPES),
    size: z.number().int().min(0).max(L.maxAttachmentBytes),
    url: localImageUrl,
  })
  .superRefine((attachment, ctx) => {
    const inline = /^data:(image\/[a-z]+);/.exec(attachment.url);
    if (inline && inline[1] !== attachment.mime) {
      ctx.addIssue({
        code: 'custom',
        path: ['mime'],
        message: 'The MIME type must match the inline image.',
      });
    }
  });

export const ChatMessageSchema = z
  .strictObject({
    format: z.literal(MESSAGE_FORMAT),
    id: actionId().optional(),
    blocks: z.array(MessageBlockSchema).min(1).max(L.maxBlocks),
    attachments: z.array(MessageAttachmentSchema).max(L.maxAttachments).default([]),
  })
  .superRefine((message, ctx) => {
    const duplicate = unique(message.attachments, (attachment) => attachment.id);
    if (duplicate !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['attachments', duplicate, 'id'],
        message: 'Attachment ids must be unique.',
      });
    }
  });

export type TextBlock = z.output<typeof TextBlockSchema>;
export type MessageButton = z.output<typeof MessageButtonSchema>;
export type ButtonsBlock = z.output<typeof ButtonsBlockSchema>;
export type MessageOption = z.output<typeof MessageOptionSchema>;
export type SelectBlock = z.output<typeof SelectBlockSchema>;
export type FormField = z.output<typeof FormFieldSchema>;
export type FormBlock = z.output<typeof FormBlockSchema>;
export type TableBlock = z.output<typeof TableBlockSchema>;
export type LinkPreviewBlock = z.output<typeof LinkPreviewBlockSchema>;
export type MessageBlock = z.output<typeof MessageBlockSchema>;
export type MessageAttachment = z.output<typeof MessageAttachmentSchema>;
export type ChatMessage = z.output<typeof ChatMessageSchema>;
/** What a sender writes (defaults such as `format: "plain"` may be omitted). */
export type ChatMessageInput = z.input<typeof ChatMessageSchema>;
