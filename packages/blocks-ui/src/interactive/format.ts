/** Format a calculator / slider value for display and `aria-valuetext`. */
export function formatUnitValue(
  value: number,
  unit: 'number' | 'compact' | 'cents' | 'percent' | undefined,
  currency = 'USD'
): string {
  if (!Number.isFinite(value)) return '—';
  switch (unit) {
    case 'percent':
      return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case 'cents':
      return (value / 100).toLocaleString(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      });
    case 'compact':
      return new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);
    default:
      return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
}
