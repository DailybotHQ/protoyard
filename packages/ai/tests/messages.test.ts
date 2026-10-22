import { describe, expect, it } from 'vitest';
import {
  attachmentUrlIssue,
  type ChatMessageInput,
  isSafeLinkUrl,
  MESSAGE_BLOCK_TYPES,
  MESSAGE_FORMAT,
  MESSAGE_LIMITS,
  messagePlainText,
  parseChatMessage,
} from '../src/messages/index.ts';

/** A `protoyard.message@1` envelope around `blocks`. */
function message_(blocks: unknown[], extra: Record<string, unknown> = {}) {
  return { format: MESSAGE_FORMAT, blocks, ...extra };
}

function ok(input: unknown) {
  const result = parseChatMessage(input);
  if (!result.success) throw new Error(JSON.stringify(result.issues, null, 2));
  return result;
}

function issues(input: unknown) {
  const result = parseChatMessage(input);
  expect(result.success).toBe(false);
  return result.issues;
}

/** One valid block of each supported type. */
const EVERY_BLOCK = [
  { type: 'text', text: 'Your weekly summary is ready.\nThree tasks are due.', format: 'markdown' },
  {
    type: 'buttons',
    buttons: [
      { label: 'Approve', action: 'approve', value: 'req-1', style: 'primary' },
      {
        label: 'Reject',
        action: 'reject',
        style: 'danger',
        confirm: {
          title: 'Reject?',
          body: 'The requester is told.',
          confirmLabel: 'Reject',
          cancelLabel: 'Keep',
        },
      },
      { label: 'Open docs', url: 'https://docs.example.com/guide' },
    ],
  },
  {
    type: 'select',
    action: 'pick-owner',
    placeholder: 'Choose an owner',
    options: [
      { value: 'ada', label: 'Ada' },
      { value: 'grace', label: 'Grace', description: 'On call this week' },
    ],
    initial: ['ada'],
  },
  {
    type: 'form',
    action: 'file-report',
    title: 'Report an issue',
    submitLabel: 'Send',
    fields: [
      { key: 'summary', label: 'Summary', kind: 'text', required: true, initial: 'Login fails' },
      { key: 'details', label: 'Details', kind: 'textarea', initial: 'Steps:\n1. Open' },
      { key: 'count', label: 'Occurrences', kind: 'number', initial: 3 },
      { key: 'seen', label: 'Seen on', kind: 'date', initial: '2026-03-04' },
      { key: 'urgent', label: 'Urgent', kind: 'checkbox', initial: false },
      {
        key: 'area',
        label: 'Area',
        kind: 'select',
        options: [{ value: 'web', label: 'Web' }],
        initial: 'web',
      },
      {
        key: 'tags',
        label: 'Tags',
        kind: 'multiselect',
        options: [
          { value: 'ui', label: 'UI' },
          { value: 'api', label: 'API' },
        ],
        initial: ['ui', 'api'],
      },
    ],
  },
  {
    type: 'table',
    title: 'Open tasks',
    columns: [
      { key: 'task', header: 'Task' },
      { key: 'points', header: 'Points', align: 'end' },
      { key: 'done', header: 'Done' },
    ],
    rows: [
      { task: 'Write brief', points: 3, done: false },
      { task: 'Review', points: null },
    ],
  },
  {
    type: 'link_preview',
    url: 'https://blog.example.com/launch',
    title: 'Launch notes',
    description: 'What shipped this week.',
    siteName: 'Example blog',
    image: 'assets/previews/launch.png',
  },
];

describe('chat message contract', () => {
  it('accepts every supported block type and fills defaults', () => {
    expect([...MESSAGE_BLOCK_TYPES].sort()).toEqual(EVERY_BLOCK.map((block) => block.type).sort());
    const { message, degraded } = ok(message_(EVERY_BLOCK));
    expect(degraded).toEqual([]);
    expect(message.format).toBe('protoyard.message@1');
    expect(message.attachments).toEqual([]);
    expect(message.blocks.map((block) => block.type)).toEqual(
      EVERY_BLOCK.map((block) => block.type)
    );
    const buttons = message.blocks[1];
    expect(buttons?.type === 'buttons' && buttons.buttons[2]?.style).toBe('default');
    const select = message.blocks[2];
    expect(select?.type === 'select' && select.multiple).toBe(false);
    const table = message.blocks[4];
    expect(table?.type === 'table' && table.columns[0]?.align).toBe('start');
  });

  it('accepts JSON text and typed input', () => {
    const input: ChatMessageInput = {
      format: MESSAGE_FORMAT,
      blocks: [{ type: 'text', text: 'Hi' }],
    };
    expect(ok(JSON.stringify(input)).message.blocks[0]).toEqual({
      type: 'text',
      text: 'Hi',
      format: 'plain',
    });
    expect(issues('{"format":')[0]?.code).toBe('invalid-json');
  });

  it('is deterministic: the same input gives the same result and issue paths', () => {
    const bad = message_([
      { type: 'buttons', buttons: [{ label: 'Go', url: 'javascript:alert(1)' }] },
    ]);
    expect(parseChatMessage(bad)).toEqual(parseChatMessage(structuredClone(bad)));
    expect(issues(bad)[0]).toMatchObject({
      code: 'invalid-message',
      path: ['blocks', 0, 'buttons', 0, 'url'],
      jsonPath: '$["blocks"][0]["buttons"][0]["url"]',
    });
  });
});

describe('unknown blocks', () => {
  it('degrade to plain text with the sender fallback, keeping their position', () => {
    const { message: parsed, degraded } = ok(
      message_([
        { type: 'text', text: 'Before' },
        { type: 'poll', question: 'Lunch?', fallback: 'Poll: Lunch? (open the app to vote)' },
        { type: 'hologram' },
        { type: 'text', text: 'After' },
      ])
    );
    expect(degraded).toEqual([
      { index: 1, originalType: 'poll' },
      { index: 2, originalType: 'hologram' },
    ]);
    expect(parsed.blocks[1]).toEqual({
      type: 'text',
      format: 'plain',
      text: 'Poll: Lunch? (open the app to vote)',
      replaces: 'poll',
    });
    expect(parsed.blocks[2]).toMatchObject({
      type: 'text',
      format: 'plain',
      text: 'This message has content this app cannot show ("hologram").',
    });
    expect(parsed.blocks[3]).toMatchObject({ text: 'After' });
  });

  it('never carries markup or unsafe text from an unknown block into the fallback', () => {
    const { message: parsed } = ok(
      message_([
        { type: 'widget', fallback: '<img src=x onerror=alert(1)>' },
        { type: '<script>alert(1)</script>', fallback: 'x'.repeat(500) },
      ])
    );
    expect(parsed.blocks[0]).toMatchObject({
      text: 'This message has content this app cannot show ("widget").',
    });
    expect(parsed.blocks[1]).toEqual({
      type: 'text',
      format: 'plain',
      text: 'This message has content this app cannot show.',
      replaces: 'unknown',
    });
    expect(JSON.stringify(parsed)).not.toContain('<img');
  });

  it('still rejects a block with no type, and invalid known blocks', () => {
    expect(issues(message_([{ text: 'no type' }]))[0]?.path).toEqual(['blocks', 0, 'type']);
    expect(
      issues(message_([{ type: 'select', action: 'a', placeholder: 'p', options: [] }]))[0]?.path
    ).toEqual(['blocks', 0, 'options']);
  });
});

describe('unsafe links', () => {
  const unsafe = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<b>x</b>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.example.com',
    '/\\evil.example.com',
    'https://user:pass@example.com/',
    'https://exa\u202emple.com',
    'relative/path',
    'http://example.com',
    'mailto:',
  ];

  it.each(unsafe)('rejects %j as a button or preview URL', (url) => {
    expect(isSafeLinkUrl(url)).toBe(false);
    expect(
      issues(message_([{ type: 'buttons', buttons: [{ label: 'Go', url }] }])).length
    ).toBeGreaterThan(0);
    expect(issues(message_([{ type: 'link_preview', url }])).length).toBeGreaterThan(0);
  });

  it('accepts https links and mailto only on buttons', () => {
    expect(isSafeLinkUrl('https://example.com/a?b=c#d')).toBe(true);
    expect(isSafeLinkUrl('http://example.com')).toBe(false);
    expect(isSafeLinkUrl('mailto:team@example.com')).toBe(true);
    ok(
      message_([{ type: 'buttons', buttons: [{ label: 'Mail', url: 'mailto:team@example.com' }] }])
    );
    expect(
      issues(message_([{ type: 'link_preview', url: 'mailto:team@example.com' }]))[0]?.path
    ).toEqual(['blocks', 0, 'url']);
  });

  it('never lets a link preview load a remote image', () => {
    const preview = (image: string) =>
      message_([{ type: 'link_preview', url: 'https://example.com', image }]);
    expect(issues(preview('https://cdn.example.com/a.png'))[0]?.path).toEqual([
      'blocks',
      0,
      'image',
    ]);
    expect(issues(preview('data:image/svg+xml;base64,PHN2Zz4='))[0]?.path).toEqual([
      'blocks',
      0,
      'image',
    ]);
    ok(preview('attachment:hero'));
  });
});

describe('markup payloads', () => {
  const markup = [
    '<script>alert(1)</script>',
    'Hello <b>there</b>',
    '<img src=x onerror=alert(1)>',
    '<!-- hidden -->',
    '<svg/onload=alert(1)>',
    '</div>',
    '<!DOCTYPE html>',
    '<?xml version="1.0"?>',
    // Unclosed: browsers still parse it as a tag.
    '<img src=x onerror=alert(1)',
  ];

  it.each(markup)('rejects %j in text, labels, cells and options', (payload) => {
    const where = [
      message_([{ type: 'text', text: payload }]),
      message_([{ type: 'buttons', buttons: [{ label: payload, action: 'go' }] }]),
      message_([{ type: 'table', columns: [{ key: 'a', header: 'A' }], rows: [{ a: payload }] }]),
      message_([
        {
          type: 'select',
          action: 'a',
          placeholder: 'p',
          options: [{ value: 'v', label: payload }],
        },
      ]),
      message_([{ type: 'link_preview', url: 'https://example.com', description: payload }]),
    ];
    for (const input of where) {
      expect(issues(input)[0]?.message).toMatch(/Markup is not allowed/);
    }
  });

  it('keeps plain comparisons and markdown that is not markup', () => {
    ok(message_([{ type: 'text', text: 'a < b and c > d, 2<3', format: 'markdown' }]));
    ok(
      message_([
        { type: 'text', text: '**Bold** and [a link](https://example.com)', format: 'markdown' },
      ])
    );
  });

  it('rejects control and bidi characters, allowing newlines only where text is multiline', () => {
    expect(issues(message_([{ type: 'text', text: 'bell\u0007' }]))[0]?.message).toMatch(/control/);
    expect(issues(message_([{ type: 'text', text: 'flip\u202eexe.pdf' }]))[0]?.message).toMatch(
      /bidirectional/
    );
    expect(
      issues(message_([{ type: 'buttons', buttons: [{ label: 'two\nlines', action: 'go' }] }]))[0]
        ?.message
    ).toMatch(/line breaks/);
  });
});

describe('limits', () => {
  it('caps the message size, nesting and block count before validating blocks', () => {
    const big = message_([{ type: 'text', text: 'x'.repeat(MESSAGE_LIMITS.maxBytes) }]);
    expect(issues(big)[0]?.code).toBe('too-large');
    expect(issues(JSON.stringify(big))[0]?.code).toBe('too-large');

    let deep: unknown = 'leaf';
    for (let i = 0; i < MESSAGE_LIMITS.maxDepth + 1; i += 1) deep = { nested: deep };
    expect(issues(message_([{ type: 'text', text: 'x', extra: deep }]))[0]?.code).toBe('too-deep');

    const many = Array.from({ length: MESSAGE_LIMITS.maxBlocks + 1 }, () => ({
      type: 'text',
      text: 'x',
    }));
    expect(issues(message_(many))[0]).toMatchObject({ code: 'too-many', jsonPath: '$["blocks"]' });
    ok(message_(many.slice(0, MESSAGE_LIMITS.maxBlocks)));
  });

  it('caps each kind', () => {
    const cases: [unknown, (string | number)[]][] = [
      [{ type: 'text', text: 'x'.repeat(MESSAGE_LIMITS.maxTextLength + 1) }, ['blocks', 0, 'text']],
      [
        {
          type: 'buttons',
          buttons: Array.from({ length: MESSAGE_LIMITS.maxButtons + 1 }, (_, i) => ({
            label: `B${i}`,
            action: `b${i}`,
          })),
        },
        ['blocks', 0, 'buttons'],
      ],
      [
        {
          type: 'select',
          action: 'a',
          placeholder: 'p',
          options: Array.from({ length: MESSAGE_LIMITS.maxOptions + 1 }, (_, i) => ({
            value: `v${i}`,
            label: `O${i}`,
          })),
        },
        ['blocks', 0, 'options'],
      ],
      [
        {
          type: 'form',
          action: 'f',
          title: 'T',
          fields: Array.from({ length: MESSAGE_LIMITS.maxFormFields + 1 }, (_, i) => ({
            key: `f${i}`,
            label: 'F',
            kind: 'text',
          })),
        },
        ['blocks', 0, 'fields'],
      ],
      [
        {
          type: 'table',
          columns: Array.from({ length: MESSAGE_LIMITS.maxTableColumns + 1 }, (_, i) => ({
            key: `c${i}`,
            header: 'C',
          })),
          rows: [],
        },
        ['blocks', 0, 'columns'],
      ],
      [
        {
          type: 'table',
          columns: [{ key: 'a', header: 'A' }],
          rows: [{ a: 'x'.repeat(MESSAGE_LIMITS.maxCellLength + 1) }],
        },
        ['blocks', 0, 'rows', 0, 'a'],
      ],
      [
        {
          type: 'buttons',
          buttons: [{ label: 'x'.repeat(MESSAGE_LIMITS.maxLabelLength + 1), action: 'a' }],
        },
        ['blocks', 0, 'buttons', 0, 'label'],
      ],
    ];
    for (const [block, path] of cases) expect(issues(message_([block]))[0]?.path).toEqual(path);

    const rows = Array.from({ length: MESSAGE_LIMITS.maxTableRows + 1 }, () => ({ a: 1 }));
    expect(
      issues(message_([{ type: 'table', columns: [{ key: 'a', header: 'A' }], rows }]))[0]?.path
    ).toEqual(['blocks', 0, 'rows']);
  });
});

describe('block rules', () => {
  it('requires exactly one of action or url on a button', () => {
    expect(
      issues(
        message_([
          {
            type: 'buttons',
            buttons: [{ label: 'Both', action: 'a', url: 'https://example.com' }],
          },
        ])
      )[0]?.message
    ).toMatch(/exactly one/);
    expect(
      issues(message_([{ type: 'buttons', buttons: [{ label: 'Neither' }] }]))[0]?.message
    ).toMatch(/exactly one/);
    expect(
      issues(
        message_([
          { type: 'buttons', buttons: [{ label: 'L', url: 'https://example.com', value: 'v' }] },
        ])
      )[0]?.path
    ).toEqual(['blocks', 0, 'buttons', 0, 'value']);
    expect(
      issues(
        message_([{ type: 'buttons', buttons: [{ label: 'Spaces', action: 'has space' }] }])
      )[0]?.path
    ).toEqual(['blocks', 0, 'buttons', 0, 'action']);
  });

  it('checks select options, initial values and single selection', () => {
    const select = (extra: Record<string, unknown>) =>
      message_([
        {
          type: 'select',
          action: 'a',
          placeholder: 'p',
          options: [
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
          ],
          ...extra,
        },
      ]);
    expect(issues(select({ initial: ['z'] }))[0]?.path).toEqual(['blocks', 0, 'initial', 0]);
    expect(issues(select({ initial: ['x', 'y'] }))[0]?.message).toMatch(/at most one/);
    ok(select({ initial: ['x', 'y'], multiple: true }));
    expect(
      issues(
        message_([
          {
            type: 'select',
            action: 'a',
            placeholder: 'p',
            options: [
              { value: 'x', label: 'X' },
              { value: 'x', label: 'Again' },
            ],
          },
        ])
      )[0]?.path
    ).toEqual(['blocks', 0, 'options', 1, 'value']);
  });

  it('checks form field options and initial values per kind', () => {
    const form = (field: Record<string, unknown>) =>
      message_([
        { type: 'form', action: 'f', title: 'T', fields: [{ key: 'k', label: 'K', ...field }] },
      ]);
    expect(issues(form({ kind: 'select' }))[0]?.message).toMatch(/needs options/);
    expect(
      issues(form({ kind: 'text', options: [{ value: 'a', label: 'A' }] }))[0]?.message
    ).toMatch(/takes no options/);
    for (const [kind, initial] of [
      ['number', 'three'],
      ['checkbox', 'yes'],
      ['date', '2026-13-01'],
      ['text', 'two\nlines'],
    ] as const) {
      expect(issues(form({ kind, initial }))[0]?.path).toEqual([
        'blocks',
        0,
        'fields',
        0,
        'initial',
      ]);
    }
    expect(
      issues(form({ kind: 'select', options: [{ value: 'a', label: 'A' }], initial: 'b' }))[0]?.path
    ).toEqual(['blocks', 0, 'fields', 0, 'initial']);
    expect(
      issues(
        message_([
          {
            type: 'form',
            action: 'f',
            title: 'T',
            fields: [
              { key: 'k', label: 'A', kind: 'text' },
              { key: 'k', label: 'B', kind: 'text' },
            ],
          },
        ])
      )[0]?.path
    ).toEqual(['blocks', 0, 'fields', 1, 'key']);
  });

  it('checks table column keys and row cells', () => {
    expect(
      issues(
        message_([{ type: 'table', columns: [{ key: 'a', header: 'A' }], rows: [{ b: 1 }] }])
      )[0]?.path
    ).toEqual(['blocks', 0, 'rows', 0, 'b']);
    expect(
      issues(
        message_([
          { type: 'table', columns: [{ key: 'a', header: 'A' }], rows: [{ a: { nested: 1 } }] },
        ])
      )[0]?.path
    ).toEqual(['blocks', 0, 'rows', 0, 'a']);
    expect(
      issues(
        message_([
          {
            type: 'table',
            columns: [
              { key: 'a', header: 'A' },
              { key: 'a', header: 'B' },
            ],
            rows: [],
          },
        ])
      )[0]?.path
    ).toEqual(['blocks', 0, 'columns', 1, 'key']);
  });
});

describe('attachments', () => {
  const png = `data:image/png;base64,${'A'.repeat(64)}`;
  const attachment = (extra: Record<string, unknown>) =>
    message_([{ type: 'text', text: 'See attached.' }], {
      attachments: [
        {
          id: 'a1',
          name: 'brief.pdf',
          mime: 'application/pdf',
          size: 1200,
          url: 'files/brief.pdf',
          ...extra,
        },
      ],
    });

  it('accepts local paths, attachment references and small inline raster images', () => {
    ok(attachment({}));
    ok(attachment({ url: '/assets/brief.pdf?v=2' }));
    ok(attachment({ url: 'attachment:a1' }));
    ok(attachment({ url: png, mime: 'image/png', name: 'chart.png' }));
  });

  it.each([
    ['https://cdn.example.com/brief.pdf', 'remote'],
    ['//cdn.example.com/brief.pdf', 'remote'],
    ['javascript:alert(1)', 'scheme'],
    ['blob:https://example.com/1', 'scheme'],
    ['file:///tmp/brief.pdf', 'scheme'],
    ['data:text/html;base64,PGI+', 'data-uri-type'],
    ['data:image/svg+xml;base64,PHN2Zz4=', 'data-uri-type'],
    ['files/../../secrets.pdf', 'traversal'],
    ['files/%2e%2e/secrets.pdf', 'traversal'],
    ['files\\brief.pdf', 'unsafe-characters'],
    ['files/brief\u0000.pdf', 'unsafe-characters'],
  ])('refuses %j (%s)', (url, reason) => {
    expect(attachmentUrlIssue(url)).toBe(reason);
    expect(issues(attachment({ url }))[0]?.path).toEqual(['attachments', 0, 'url']);
  });

  it('caps inline images, sizes and counts, and checks names and types', () => {
    const tooBig = `data:image/png;base64,${'A'.repeat(Math.ceil((MESSAGE_LIMITS.maxDataUriBytes * 4) / 3) + 8)}`;
    expect(attachmentUrlIssue(tooBig)).toBe('data-uri-size');
    expect(issues(attachment({ url: png, mime: 'image/jpeg' }))[0]?.path).toEqual([
      'attachments',
      0,
      'mime',
    ]);
    expect(issues(attachment({ mime: 'text/html' }))[0]?.path).toEqual(['attachments', 0, 'mime']);
    expect(issues(attachment({ name: '../etc/passwd' }))[0]?.path).toEqual([
      'attachments',
      0,
      'name',
    ]);
    expect(issues(attachment({ size: MESSAGE_LIMITS.maxAttachmentBytes + 1 }))[0]?.path).toEqual([
      'attachments',
      0,
      'size',
    ]);
    const many = Array.from({ length: MESSAGE_LIMITS.maxAttachments + 1 }, (_, i) => ({
      id: `a${i}`,
      name: `f${i}.txt`,
      mime: 'text/plain',
      size: 1,
      url: `files/f${i}.txt`,
    }));
    expect(issues(message_([{ type: 'text', text: 'x' }], { attachments: many }))[0]?.path).toEqual(
      ['attachments']
    );
    expect(
      issues(
        message_([{ type: 'text', text: 'x' }], {
          attachments: [many[0], { ...many[1], id: 'a0' }],
        })
      )[0]?.path
    ).toEqual(['attachments', 1, 'id']);
  });
});

describe('envelope', () => {
  it('requires the format, rejects newer versions and unknown keys', () => {
    expect(issues({ blocks: [{ type: 'text', text: 'x' }] })[0]?.path).toEqual(['format']);
    expect(issues({ format: 'protoyard.message@2', blocks: [] })[0]).toMatchObject({
      code: 'unsupported-version',
      jsonPath: '$["format"]',
    });
    expect(issues(message_([{ type: 'text', text: 'x' }], { html: '<b>' }))[0]?.code).toBe(
      'invalid-message'
    );
    expect(issues(message_([]))[0]?.path).toEqual(['blocks']);
  });

  it('refuses prototype keys, non-JSON values and cycles', () => {
    expect(
      issues(JSON.parse('{"format":"protoyard.message@1","blocks":[],"__proto__":{"x":1}}'))[0]
        ?.code
    ).toBe('unsafe-key');
    expect(issues(message_([{ type: 'text', text: 'x', at: new Date(0) }]))[0]?.code).toBe(
      'invalid-input'
    );
    expect(issues(message_([{ type: 'text', text: 'x', n: Number.NaN }]))[0]?.code).toBe(
      'invalid-input'
    );
    const cyclic: Record<string, unknown> = { format: MESSAGE_FORMAT, blocks: [] };
    cyclic.self = cyclic;
    expect(issues(cyclic)[0]?.code).toBe('invalid-input');
    expect(issues(null)[0]?.code).toBe('invalid-input');
    expect(issues([1, 2])[0]?.code).toBe('invalid-input');
  });
});

describe('messagePlainText', () => {
  it('renders every block and attachment as plain text', () => {
    const parsed = ok(
      message_(EVERY_BLOCK, {
        attachments: [
          {
            id: 'a1',
            name: 'brief.pdf',
            mime: 'application/pdf',
            size: 10,
            url: 'files/brief.pdf',
          },
        ],
      })
    ).message;
    expect(messagePlainText(parsed).split('\n')).toEqual([
      'Your weekly summary is ready.',
      'Three tasks are due.',
      '[Approve] [Reject] [Open docs]',
      'Choose an owner',
      '- Ada',
      '- Grace',
      'Report an issue',
      '- Summary',
      '- Details',
      '- Occurrences',
      '- Seen on',
      '- Urgent',
      '- Area',
      '- Tags',
      'Open tasks',
      'Task | Points | Done',
      'Write brief | 3 | false',
      'Review |  | ',
      'Launch notes — https://blog.example.com/launch',
      'Attachment: brief.pdf',
    ]);
  });
});
