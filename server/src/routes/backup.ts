import { Hono } from 'hono';
import { Readable } from 'node:stream';
import { type AuthEnv, destroySession, requireAdmin } from '../lib/auth.ts';
import { createBackup, restoreBackup } from '../lib/backup.ts';
import { fail } from '../lib/http.ts';

// One export or restore at a time: a restore replaces everything an export is reading.
let busy = false;

function lock() {
  if (busy) fail(409, 'Une sauvegarde ou une restauration est déjà en cours');
  busy = true;
}

export const backup = new Hono<AuthEnv>()
  // Download: works with a session or an admin API key (scheduled backups).
  .get('/', async (c) => {
    requireAdmin(c);
    lock();
    let backup: Awaited<ReturnType<typeof createBackup>>;
    try {
      backup = await createBackup();
    } catch (err) {
      busy = false;
      throw err;
    }
    const { stream, filename } = backup;
    // Released when the download ends, completed or not.
    stream.on('close', () => (busy = false));
    return c.body(Readable.toWeb(stream) as ReadableStream, 200, {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    });
  })

  // Restore: replaces all content and photos, then signs everybody out.
  .post('/', async (c) => {
    requireAdmin(c);
    if (c.get('apiKey')) fail(403, 'Restauration impossible avec une clé API : connectez-vous dans le back-office');
    const body = c.req.raw.body;
    if (!body) fail(400, 'Fichier de sauvegarde manquant');
    lock();
    let result: Awaited<ReturnType<typeof restoreBackup>>;
    try {
      result = await restoreBackup(body);
    } finally {
      busy = false;
    }
    destroySession(c);
    return c.json({ ok: true, ...result });
  });
