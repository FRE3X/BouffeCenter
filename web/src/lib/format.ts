export const price = (level: number | null) => (level ? '€'.repeat(level) : '');

export const rating = (value: number | null) =>
  value === null ? '–' : Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');

/** Ratings go from 1 to 10: the closer to 10, the closer to the Bouffe Center red. */
export function ratingColor(value: number | null) {
  if (value === null) return 'var(--muted)';
  const pct = Math.round(Math.min(1, Math.max(0, (value - 1) / 9)) * 100);
  return `color-mix(in oklab, #D1382F ${pct}%, #8C8279)`;
}

export const date = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export const euros = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? ''
    : (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 });
