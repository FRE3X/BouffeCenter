import type { Meal } from './types';

export const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Matin' },
  { key: 'lunch', label: 'Midi' },
  { key: 'dinner', label: 'Soir' },
];

// Dates are 'YYYY-MM-DD'; format them in UTC so the day never shifts with the viewer's time zone.
const fmt = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...options }).format(new Date(`${date}T00:00:00Z`));

/** "lundi", "mardi"… */
export const weekday = (date: string) => fmt(date, { weekday: 'long' });

/** "20 oct." */
export const dayMonth = (date: string) => fmt(date, { day: 'numeric', month: 'short' });

/** "du 19 au 25 octobre 2026", or "du 26 octobre au 1 novembre 2026" across months. */
export function weekRange(monday: string, sunday: string) {
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  const start = sameMonth ? fmt(monday, { day: 'numeric' }) : fmt(monday, { day: 'numeric', month: 'long' });
  return `du ${start} au ${fmt(sunday, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
