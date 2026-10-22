export type KitEntry = { id: string; name: string; group: string; summary: string; demo: string };

export const ENTRIES: KitEntry[] = [
  {
    id: 'button',
    name: 'Button',
    group: 'Actions',
    summary: 'Primary, quiet and destructive actions.',
    demo: 'ButtonDemo',
  },
  {
    id: 'badge',
    name: 'Badge',
    group: 'Feedback',
    summary: 'Compact status and category labels.',
    demo: 'BadgeDemo',
  },
  {
    id: 'card',
    name: 'Card',
    group: 'Surfaces',
    summary: 'A flexible surface for related content.',
    demo: 'CardDemo',
  },
  {
    id: 'field',
    name: 'Text field',
    group: 'Forms',
    summary: 'A labelled input with clear focus and error states.',
    demo: 'FieldDemo',
  },
];

export const GROUPS = [...new Set(ENTRIES.map((entry) => entry.group))];
