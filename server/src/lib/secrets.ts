import { q } from '../db.ts';

/** Integration keys and counters: never exported by a backup nor replaced by a restore. */
export function getSecret(key: string): string | null {
  return q.get<{ value: string }>('SELECT value FROM secrets WHERE key = ?', [key])?.value ?? null;
}

export function setSecret(key: string, value: string) {
  q.run('INSERT INTO secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

export function deleteSecret(key: string) {
  q.run('DELETE FROM secrets WHERE key = ?', [key]);
}
