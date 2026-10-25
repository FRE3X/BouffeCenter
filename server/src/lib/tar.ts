// Minimal tar (ustar) support for backups: regular files only, no dependency.
import fs from 'node:fs';
import fsp from 'node:fs/promises';

export type TarEntry = { name: string; path: string; size: number; mtime: number };

const BLOCK = 512;

function octal(buf: Buffer, value: number, offset: number, length: number) {
  buf.write(`${value.toString(8).padStart(length - 1, '0')}\0`, offset, length, 'ascii');
}

function header(entry: TarEntry): Buffer {
  const h = Buffer.alloc(BLOCK);
  if (Buffer.byteLength(entry.name) > 100) throw new Error(`Nom trop long pour l'archive : ${entry.name}`);
  h.write(entry.name, 0, 100, 'utf8');
  octal(h, 0o644, 100, 8);
  octal(h, 0, 108, 8);
  octal(h, 0, 116, 8);
  octal(h, entry.size, 124, 12);
  octal(h, Math.floor(entry.mtime), 136, 12);
  h.fill(' ', 148, 156);
  h.write('0', 156, 'ascii');
  h.write('ustar\0', 257, 'ascii');
  h.write('00', 263, 'ascii');
  const sum = h.reduce((a, b) => a + b, 0);
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return h;
}

/** Streams a tar archive of the given files (pipe it through gzip). */
export async function* tarStream(entries: TarEntry[]): AsyncGenerator<Buffer> {
  for (const entry of entries) {
    yield header(entry);
    let written = 0;
    if (entry.size > 0) {
      for await (const chunk of fs.createReadStream(entry.path, { start: 0, end: entry.size - 1 })) {
        written += chunk.length;
        yield chunk as Buffer;
      }
    }
    if (written !== entry.size) throw new Error(`Fichier modifié pendant l'export : ${entry.name}`);
    const pad = (BLOCK - (entry.size % BLOCK)) % BLOCK;
    if (pad) yield Buffer.alloc(pad);
  }
  yield Buffer.alloc(BLOCK * 2);
}

const text = (buf: Buffer, offset: number, length: number) => {
  const raw = buf.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? length : end).toString('utf8');
};

function parseOctal(buf: Buffer, offset: number, length: number): number {
  if (buf[offset] & 0x80) throw new Error('Archive non prise en charge (fichier trop gros)');
  const value = parseInt(text(buf, offset, length).trim() || '0', 8);
  if (!Number.isFinite(value)) throw new Error('Archive invalide');
  return value;
}

/** `path=` record of a pax extended header (long names written by GNU/BSD tar). */
function paxPath(data: Buffer): string | null {
  for (const line of data.toString('utf8').split('\n')) {
    const match = /^\d+ path=(.*)$/.exec(line);
    if (match) return match[1];
  }
  return null;
}

/**
 * Reads a tar file from disk. For each regular file, `destination(name)` returns where to write it,
 * or null to skip it. Directories, links and other entry types are ignored.
 */
export async function extractTar(tarPath: string, destination: (name: string) => string | null) {
  const fh = await fsp.open(tarPath);
  try {
    const h = Buffer.alloc(BLOCK);
    let offset = 0;
    let nextName: string | null = null;
    for (;;) {
      const { bytesRead } = await fh.read(h, 0, BLOCK, offset);
      if (bytesRead < BLOCK) throw new Error('Archive tronquée');
      if (h.every((b) => b === 0)) return;
      const expected = parseOctal(h, 148, 8);
      const sum = h.reduce((a, b, i) => a + (i >= 148 && i < 156 ? 32 : b), 0);
      if (sum !== expected) throw new Error('Archive invalide (somme de contrôle)');

      const size = parseOctal(h, 124, 12);
      const type = h[156] === 0 ? '0' : String.fromCharCode(h[156]);
      const prefix = text(h, 257, 6) === 'ustar' ? text(h, 345, 155) : '';
      const name = nextName ?? (prefix ? `${prefix}/${text(h, 0, 100)}` : text(h, 0, 100));
      const start = offset + BLOCK;
      offset = start + Math.ceil(size / BLOCK) * BLOCK;

      if (type === 'x') {
        const data = Buffer.alloc(size);
        await fh.read(data, 0, size, start);
        nextName = paxPath(data);
        continue;
      }
      nextName = null;
      if (type !== '0' && type !== '7') continue;
      const dest = destination(name);
      if (!dest) continue;
      if (size === 0) {
        await fsp.writeFile(dest, '');
        continue;
      }
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(tarPath, { start, end: start + size - 1 })
          .on('error', reject)
          .pipe(fs.createWriteStream(dest))
          .on('error', reject)
          .on('finish', resolve);
      });
    }
  } finally {
    await fh.close();
  }
}
