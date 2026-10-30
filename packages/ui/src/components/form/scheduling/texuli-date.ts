import { dateSegmentOrder } from '@texuli/primitives/date-field';
import type { IsoDate } from './dates.ts';
import type { IsoWeekday } from './weekdays.ts';

/**
 * Small mappings between Protoyard's scheduling props and Texuli's date
 * components (`texuli/date` and `@texuli/primitives/date-picker`).
 */

/** ISO weekday (1 = Monday … 7 = Sunday) as Texuli's `weekStartsOn` (0 = Sunday … 6). */
export function texuliWeekStart(day: IsoWeekday): number {
  return day % 7;
}

/** Protoyard's `isDateDisabled(iso)` as Texuli's `isDateUnavailable(CalendarDate)`. */
export function texuliUnavailable(
  isDateDisabled: ((date: IsoDate) => boolean) | undefined
): ((date: { toString(): string }) => boolean) | undefined {
  return isDateDisabled ? (date) => Boolean(isDateDisabled(date.toString())) : undefined;
}

/**
 * Texuli's typed text (segments in locale order, like `2/30/2026`) as a
 * `YYYY-MM-DD` string, so `onInvalid` keeps reporting Protoyard's format.
 * Returns `null` when a segment is missing.
 */
export function typedIsoText(text: string, locale: string | undefined): IsoDate | null {
  const numbers = text.split(/\D+/).filter(Boolean);
  if (numbers.length !== 3) return null;
  const order = dateSegmentOrder(locale);
  const parts: Record<string, string> = {};
  order.forEach((segment, index) => {
    parts[segment] = numbers[index] ?? '';
  });
  const year = (parts.year ?? '').padStart(4, '0');
  const month = (parts.month ?? '').padStart(2, '0');
  const day = (parts.day ?? '').padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The date segments (spinbuttons) inside a field group, empty or not. */
function segments(group: Element | null | undefined): HTMLInputElement[] {
  return Array.from(group?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? []);
}

/** Whether every date segment of a field group is empty. */
export function segmentsEmpty(group: Element | null | undefined): boolean {
  return segments(group).every((input) => input.value === '');
}

/**
 * How the `<label for={id}>` that points at a field's first segment names the
 * field group: by its id (FormField's label has one), for `aria-labelledby`,
 * else by its text without the decorative required marker, for `aria-label`.
 * The segments keep their own names (Month, Day, Year), so without this the
 * group would not carry the label at all.
 */
export function groupLabelFor(
  node: Element | null | undefined,
  id: string
): { id?: string; text?: string } {
  const label = node?.ownerDocument?.querySelector(`label[for="${CSS.escape(id)}"]`);
  if (!label) return {};
  if (label.id) return { id: label.id };
  const copy = label.cloneNode(true) as Element;
  for (const hidden of Array.from(copy.querySelectorAll('[aria-hidden="true"]'))) hidden.remove();
  const text = copy.textContent?.trim();
  return text ? { text } : {};
}
