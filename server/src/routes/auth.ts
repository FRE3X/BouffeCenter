import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { q } from '../db.ts';
import {
  type AuthEnv,
  type User,
  createSession,
  destroySession,
  hashPassword,
  requireUser,
  sha256,
  syncMemberHint,
  verifyPassword,
} from '../lib/auth.ts';
import { fail } from '../lib/http.ts';

const attempts = new Map<string, { count: number; until: number }>();

function throttle(key: string) {
  const entry = attempts.get(key);
  if (entry && entry.until > Date.now() && entry.count >= 5) fail(429, 'Trop de tentatives, réessayez plus tard');
}

function recordFailure(key: string) {
  const entry = attempts.get(key);
  const fresh = !entry || entry.until < Date.now();
  attempts.set(key, { count: fresh ? 1 : entry.count + 1, until: Date.now() + 15 * 60_000 });
}

const password = z.string().min(8, 'Mot de passe : 8 caractères minimum').max(200);

export const auth = new Hono<AuthEnv>()
  .post('/login', validate('json', z.object({ email: z.string().trim(), password: z.string() })), async (c) => {
    const { email, password: pw } = c.req.valid('json');
    const key = email.toLowerCase();
    throttle(key);
    const row = q.get<User & { password_hash: string | null }>(
      'SELECT id, email, pseudo, role, password_hash FROM users WHERE email = ?',
      [email],
    );
    if (!row || !(await verifyPassword(pw, row.password_hash))) {
      recordFailure(key);
      fail(401, 'Email ou mot de passe incorrect');
    }
    attempts.delete(key);
    const token = createSession(c, row.id);
    const { password_hash: _, ...user } = row;
    return c.json({ user, token });
  })

  .post('/logout', (c) => {
    destroySession(c);
    return c.json({ ok: true });
  })

  .get('/me', (c) => {
    syncMemberHint(c, Boolean(c.get('user')));
    return c.json({ user: c.get('user') });
  })

  .patch(
    '/me',
    validate(
      'json',
      z.object({
        pseudo: z.string().trim().min(2).max(40).optional(),
        password: password.optional(),
        current_password: z.string().optional(),
      }),
    ),
    async (c) => {
      const user = requireUser(c);
      const body = c.req.valid('json');
      if (body.password) {
        const stored = q.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [user.id]);
        if (!(await verifyPassword(body.current_password ?? '', stored?.password_hash ?? null)))
          fail(400, 'Mot de passe actuel incorrect');
        q.run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(body.password), user.id]);
      }
      if (body.pseudo) {
        if (q.get('SELECT 1 FROM users WHERE pseudo = ? AND id != ?', [body.pseudo, user.id])) fail(409, 'Pseudo déjà pris');
        q.run('UPDATE users SET pseudo = ? WHERE id = ?', [body.pseudo, user.id]);
      }
      return c.json({ user: q.get<User>('SELECT id, email, pseudo, role FROM users WHERE id = ?', [user.id]) });
    },
  )

  .get('/invite/:token', (c) => {
    const row = q.get<{ email: string; pseudo: string }>(
      'SELECT email, pseudo FROM users WHERE invite_token_hash = ? AND invite_expires_at > unixepoch()',
      [sha256(c.req.param('token'))],
    );
    if (!row) fail(404, 'Invitation invalide ou expirée');
    return c.json(row);
  })

  .post('/invite/:token', validate('json', z.object({ password })), async (c) => {
    const row = q.get<User>(
      'SELECT id, email, pseudo, role FROM users WHERE invite_token_hash = ? AND invite_expires_at > unixepoch()',
      [sha256(c.req.param('token'))],
    );
    if (!row) fail(404, 'Invitation invalide ou expirée');
    q.run('UPDATE users SET password_hash = ?, invite_token_hash = NULL, invite_expires_at = NULL WHERE id = ?', [
      await hashPassword(c.req.valid('json').password),
      row.id,
    ]);
    const token = createSession(c, row.id);
    return c.json({ user: row, token });
  });
