import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { q } from '../db.ts';
import { API_KEY_PREFIX, type AuthEnv, randomToken, requireUser, sha256 } from '../lib/auth.ts';
import { fail, parseId } from '../lib/http.ts';

type KeyRow = {
  id: number;
  user_id: number;
  owner: string;
  name: string;
  prefix: string;
  expires_at: number | null;
  last_used_at: number | null;
  created_at: number;
};

const SELECT = `SELECT k.id, k.user_id, u.pseudo AS owner, k.name, k.prefix, k.expires_at, k.last_used_at, k.created_at
  FROM api_keys k JOIN users u ON u.id = k.user_id`;

const listQuery = z.object({ all: z.stringbool().optional() });

const keyInput = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(60),
  // Validity in days; null means the key never expires.
  expires_in_days: z.number().int().min(1, 'Validité : 1 jour minimum').max(3650, 'Validité : 10 ans maximum').nullable(),
});

const serialize = (row: KeyRow) => ({ ...row, expired: row.expires_at !== null && row.expires_at <= Date.now() / 1000 });

export const apiKeys = new Hono<AuthEnv>()
  // Keys are managed from a signed-in session only: a leaked key cannot mint new ones.
  .use(async (c, next) => {
    if (c.get('apiKey')) fail(403, 'Gestion des clés impossible avec une clé API');
    await next();
  })

  .get('/', validate('query', listQuery), (c) => {
    const user = requireUser(c);
    const all = c.req.valid('query').all;
    if (all && user.role !== 'admin') fail(403, 'Réservé aux administrateurs');
    const rows = all
      ? q.all<KeyRow>(`${SELECT} ORDER BY k.created_at DESC`)
      : q.all<KeyRow>(`${SELECT} WHERE k.user_id = ? ORDER BY k.created_at DESC`, [user.id]);
    return c.json(rows.map(serialize));
  })

  .post('/', validate('json', keyInput), (c) => {
    const user = requireUser(c);
    const { name, expires_in_days } = c.req.valid('json');
    const token = `${API_KEY_PREFIX}${randomToken()}`;
    const expires = expires_in_days === null ? null : Math.floor(Date.now() / 1000) + expires_in_days * 86400;
    const id = q.insert('INSERT INTO api_keys (user_id, name, token_hash, prefix, expires_at) VALUES (?, ?, ?, ?, ?)', [
      user.id,
      name,
      sha256(token),
      token.slice(0, 10),
      expires,
    ]);
    // The full key is returned once, here; only its hash is stored.
    return c.json({ ...serialize(q.get<KeyRow>(`${SELECT} WHERE k.id = ?`, [id])!), token }, 201);
  })

  .delete('/:id', (c) => {
    const user = requireUser(c);
    const row = q.get<KeyRow>(`${SELECT} WHERE k.id = ?`, [parseId(c.req.param('id'))]);
    if (!row || (row.user_id !== user.id && user.role !== 'admin')) fail(404, 'Clé introuvable');
    q.run('DELETE FROM api_keys WHERE id = ?', [row.id]);
    return c.json({ ok: true });
  });
