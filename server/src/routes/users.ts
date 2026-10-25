import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { config } from '../config.ts';
import { q } from '../db.ts';
import { type AuthEnv, randomToken, requireAdmin, sha256 } from '../lib/auth.ts';
import { fail, parseId } from '../lib/http.ts';

function issueInvite(userId: number) {
  const token = randomToken();
  q.run('UPDATE users SET invite_token_hash = ?, invite_expires_at = unixepoch() + ? WHERE id = ?', [
    sha256(token),
    config.inviteDays * 86400,
    userId,
  ]);
  return `${config.publicUrl}/admin#/invitation/${token}`;
}

const role = z.enum(['admin', 'editor']);

export const users = new Hono<AuthEnv>()
  .use(async (c, next) => {
    requireAdmin(c);
    await next();
  })

  .get('/', (c) =>
    c.json(
      q.all(
        `SELECT id, email, pseudo, role, created_at,
           password_hash IS NULL AS pending,
           (SELECT count(*) FROM places WHERE author_id = users.id) AS places,
           (SELECT count(*) FROM recipes WHERE author_id = users.id) AS recipes,
           (SELECT count(*) FROM reviews WHERE user_id = users.id) AS reviews
         FROM users ORDER BY created_at`,
      ),
    ),
  )

  .post(
    '/',
    validate('json', z.object({ email: z.email(), pseudo: z.string().trim().min(2).max(40), role: role.default('editor') })),
    (c) => {
      const { email, pseudo, role } = c.req.valid('json');
      if (q.get('SELECT 1 FROM users WHERE email = ? OR pseudo = ?', [email, pseudo])) fail(409, 'Email ou pseudo déjà utilisé');
      const id = q.insert('INSERT INTO users (email, pseudo, role) VALUES (?, ?, ?)', [email, pseudo, role]);
      return c.json({ id, invite_url: issueInvite(id) }, 201);
    },
  )

  .post('/:id/invite', (c) => {
    const id = parseId(c.req.param('id'));
    if (!q.get('SELECT 1 FROM users WHERE id = ?', [id])) fail(404, 'Utilisateur introuvable');
    return c.json({ invite_url: issueInvite(id) });
  })

  .patch('/:id', validate('json', z.object({ role: role.optional(), pseudo: z.string().trim().min(2).max(40).optional() })), (c) => {
    const id = parseId(c.req.param('id'));
    const body = c.req.valid('json');
    if (body.role && id === c.get('user')!.id) fail(400, 'Vous ne pouvez pas changer votre propre rôle');
    if (body.role) q.run('UPDATE users SET role = ? WHERE id = ?', [body.role, id]);
    if (body.pseudo) q.run('UPDATE users SET pseudo = ? WHERE id = ?', [body.pseudo, id]);
    return c.json({ ok: true });
  })

  .delete('/:id', (c) => {
    const id = parseId(c.req.param('id'));
    if (id === c.get('user')!.id) fail(400, 'Vous ne pouvez pas supprimer votre propre compte');
    q.run('DELETE FROM users WHERE id = ?', [id]);
    return c.json({ ok: true });
  });
