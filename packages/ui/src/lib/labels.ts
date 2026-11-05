/**
 * Drop the keys whose value is `undefined`, so a Texuli `labels` object that
 * is spread over the component's dictionary defaults keeps those defaults
 * (`{ ...defaults, ...{ label: undefined } }` would erase them).
 */
export function definedLabels<T extends Record<string, unknown>>(labels: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(labels).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
