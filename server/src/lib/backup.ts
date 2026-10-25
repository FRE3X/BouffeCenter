import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HTTPException } from 'hono/http-exception';
import { config } from '../config.ts';
import { SCHEMA_VERSION, db, migrate, q, schemaVersion, tx } from '../db.ts';
import { fail } from './http.ts';
import { type TarEntry, extractTar, tarStream } from './tar.ts';

/**
 * Backup = a .tar.gz with manifest.json, a consistent copy of the SQLite database (sessions removed)
 * and every file of uploads/. Temporary files live in DATA_DIR/.tmp so the final renames stay on one disk.
 */
const TMP_DIR = path.join(config.dataDir, '.tmp');
const DB_NAME = 'bouffe-center.db';
const UPLOAD_NAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

export type Manifest = {
  app: 'bouffe-center';
  format: 1;
  schema_version: number;
  created_at: string;
  counts: Record<string, number>;
};

/** Leftovers of an interrupted export or restore. */
export async function cleanBackupTmp() {
  await fsp.rm(TMP_DIR, { recursive: true, force: true });
}

async function tmpDir(kind: string) {
  await fsp.mkdir(TMP_DIR, { recursive: true });
  return fsp.mkdtemp(path.join(TMP_DIR, `${kind}-`));
}

function counts(target: { prepare: DatabaseSync['prepare'] }) {
  const n = (table: string) => Number((target.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n);
  return {
    places: n('places'),
    recipes: n('recipes'),
    products: n('products'),
    reviews: n('reviews'),
    images: n('images'),
    users: n('users'),
  };
}

export async function createBackup(): Promise<{ stream: Readable; filename: string }> {
  const dir = await tmpDir('export');
  try {
    const dbFile = path.join(dir, DB_NAME);
    db.prepare('VACUUM INTO ?').run(dbFile);
    // Sessions and integration keys are live secrets; API keys are kept (hashed) so integrations survive a restore.
    const snapshot = new DatabaseSync(dbFile);
    snapshot.exec('DELETE FROM sessions; DELETE FROM secrets; VACUUM;');
    const manifest: Manifest = {
      app: 'bouffe-center',
      format: 1,
      schema_version: SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      counts: counts(snapshot),
    };
    snapshot.close();
    const manifestFile = path.join(dir, 'manifest.json');
    await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2));

    const entry = async (name: string, file: string): Promise<TarEntry> => {
      const stat = await fsp.stat(file);
      return { name, path: file, size: stat.size, mtime: stat.mtimeMs / 1000 };
    };
    const entries = [await entry('manifest.json', manifestFile), await entry(DB_NAME, dbFile)];
    for (const file of await fsp.readdir(config.uploadDir, { withFileTypes: true })) {
      if (file.isFile() && UPLOAD_NAME.test(file.name)) {
        entries.push(await entry(`uploads/${file.name}`, path.join(config.uploadDir, file.name)));
      }
    }

    const source = Readable.from(tarStream(entries));
    const gzip = zlib.createGzip({ level: 6 });
    source.on('error', (err) => gzip.destroy(err));
    gzip.on('close', () => fsp.rm(dir, { recursive: true, force: true }));
    source.pipe(gzip);
    const day = manifest.created_at.slice(0, 10);
    return { stream: gzip, filename: `bouffe-center-${day}.tar.gz` };
  } catch (err) {
    await fsp.rm(dir, { recursive: true, force: true });
    throw err;
  }
}

function sizeLimit(max: number) {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _, cb) {
      total += chunk.length;
      if (total > max) cb(new HTTPException(413, { message: `Sauvegarde trop lourde (max ${Math.round(max / 1048576)} Mo)` }));
      else cb(null, chunk);
    },
  });
}

/** Archive member → destination file, or null to ignore it (macOS "._" files, folders, anything unexpected). */
function destination(dir: string, name: string): string | null {
  const parts = name.replace(/^(\.\/)+/, '').split('/').filter(Boolean);
  // Accept an optional top-level folder (an archive re-made from an extracted backup).
  if (parts.length > 1 && parts[0] !== 'uploads' && (parts[1] === 'uploads' || parts.length === 2)) parts.shift();
  const base = parts.at(-1) ?? '';
  if (base.startsWith('._')) return null;
  if (parts.length === 1 && (base === DB_NAME || base === 'manifest.json')) return path.join(dir, base);
  if (parts.length === 2 && parts[0] === 'uploads' && UPLOAD_NAME.test(base)) return path.join(dir, 'uploads', base);
  return null;
}

/** Replaces every row of the live database with the backup's, in one transaction. */
function replaceData(file: string) {
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.prepare('ATTACH DATABASE ? AS src').run(file);
    try {
      tx(() => {
        const tables = q.all<{ name: string }>(
          `SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'`,
        );
        for (const { name } of tables) {
          // Integration keys are never part of a backup: the server keeps its own.
          if (name === 'secrets') continue;
          const quoted = `"${name.replace(/"/g, '""')}"`;
          q.run(`DELETE FROM main.${quoted}`);
          // Everybody signs in again after a restore: user ids may now belong to other people.
          if (name === 'sessions') continue;
          const cols = (db.prepare(`PRAGMA main.table_info(${quoted})`).all() as { name: string }[]).map((c) => c.name);
          const srcCols = new Set((db.prepare(`PRAGMA src.table_info(${quoted})`).all() as { name: string }[]).map((c) => c.name));
          const shared = cols.filter((c) => srcCols.has(c)).map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
          if (shared) q.run(`INSERT INTO main.${quoted} (${shared}) SELECT ${shared} FROM src.${quoted}`);
        }
        if (db.prepare('PRAGMA main.foreign_key_check').all().length) fail(400, 'Sauvegarde incohérente (références cassées)');
      });
    } finally {
      db.exec('DETACH DATABASE src');
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export async function restoreBackup(body: ReadableStream<Uint8Array>) {
  const dir = await tmpDir('import');
  try {
    const tarFile = path.join(dir, 'backup.tar');
    try {
      await pipeline(Readable.fromWeb(body as never), sizeLimit(config.maxRestoreBytes), zlib.createGunzip(), fs.createWriteStream(tarFile));
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      fail(400, 'Fichier invalide : une sauvegarde .tar.gz est attendue');
    }

    const files = path.join(dir, 'files');
    await fsp.mkdir(path.join(files, 'uploads'), { recursive: true });
    try {
      await extractTar(tarFile, (name) => destination(files, name));
    } catch (err) {
      fail(400, `Archive illisible : ${(err as Error).message}`);
    }
    await fsp.rm(tarFile);

    const manifestFile = path.join(files, 'manifest.json');
    if (fs.existsSync(manifestFile)) {
      const manifest = JSON.parse(await fsp.readFile(manifestFile, 'utf8').catch(() => '{}')) as Partial<Manifest>;
      if (manifest.app !== 'bouffe-center') fail(400, "Ce fichier n'est pas une sauvegarde Bouffe Center");
    }
    const dbFile = path.join(files, DB_NAME);
    if (!fs.existsSync(dbFile)) fail(400, `Sauvegarde incomplète : ${DB_NAME} est absent`);

    let restored: ReturnType<typeof counts>;
    let src: DatabaseSync;
    try {
      src = new DatabaseSync(dbFile);
    } catch {
      fail(400, "La base de données de la sauvegarde n'est pas lisible");
    }
    try {
      const check = src.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (check.integrity_check !== 'ok') fail(400, 'La base de données de la sauvegarde est endommagée');
      const version = schemaVersion(src);
      if (version === 0) fail(400, "La base de données n'est pas une base Bouffe Center");
      if (version > SCHEMA_VERSION) fail(400, 'Sauvegarde créée par une version plus récente de Bouffe Center : mettez le site à jour');
      // An older backup is upgraded to the current schema before it replaces anything.
      migrate(src);
      restored = counts(src);
    } finally {
      src.close();
    }

    replaceData(dbFile);

    // Swap the photo folder only once the database is in place (same disk: instant renames).
    const previous = path.join(dir, 'uploads-previous');
    await fsp.rename(config.uploadDir, previous);
    await fsp.rename(path.join(files, 'uploads'), config.uploadDir);

    const missing = q
      .all<{ id: string }>('SELECT id FROM images')
      .filter(({ id }) => !fs.existsSync(path.join(config.uploadDir, `${id}-sm.webp`))).length;
    return { counts: restored, missing_images: missing };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}
