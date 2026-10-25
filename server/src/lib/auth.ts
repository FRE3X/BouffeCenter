import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from '../config.ts';
import { q } from '../db.ts';
import { fail } from './http.ts';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'bc_session';
/** Readable by the page (no secret inside): lets public pages show "Modifier" buttons without an API call. */
export const MEMBER_HINT_COOKIE = 'bc_member';

export type User = { id: number; email: string; pseudo: string; role: 'admin' | 'editor' };

/** `apiKey` is true when the request is authenticated by a personal API key rather than a session. */
export type AuthEnv = { Variables: { user: User | null; apiKey: boolean } };

/** Personal API keys start with this prefix, which tells them apart from session tokens. */
export const API_KEY_PREFIX = 'bc_';

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createSession(c: Context, userId: number): string {
  const token = randomToken();
  const expires = Math.floor(Date.now() / 1000) + config.sessionDays * 86400;
  q.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [sha256(token), userId, expires]);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.secureCookies,
    path: '/',
    maxAge: config.sessionDays * 86400,
  });
  setCookie(c, MEMBER_HINT_COOKIE, '1', {
    sameSite: 'Lax',
    secure: config.secureCookies,
    path: '/',
    maxAge: config.sessionDays * 86400,
  });
  return token;
}

/** Keeps the readable member hint in sync with the real session (for sessions opened before it existed). */
export function syncMemberHint(c: Context, loggedIn: boolean) {
  const hasHint = getCookie(c, MEMBER_HINT_COOKIE) === '1';
  if (loggedIn && !hasHint) {
    setCookie(c, MEMBER_HINT_COOKIE, '1', { sameSite: 'Lax', secure: config.secureCookies, path: '/', maxAge: config.sessionDays * 86400 });
  } else if (!loggedIn && hasHint) {
    deleteCookie(c, MEMBER_HINT_COOKIE, { path: '/' });
  }
}

export function destroySession(c: Context) {
  const token = readToken(c);
  if (token) q.run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  deleteCookie(c, MEMBER_HINT_COOKIE, { path: '/' });
}

function readToken(c: Context): string | undefined {
  const header = c.req.header('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return getCookie(c, SESSION_COOKIE);
}

function userFromApiKey(token: string): User | null {
  const row = q.get<User & { key_id: number }>(
    `SELECT k.id AS key_id, u.id, u.email, u.pseudo, u.role FROM api_keys k JOIN users u ON u.id = k.user_id
     WHERE k.token_hash = ? AND (k.expires_at IS NULL OR k.expires_at > unixepoch())`,
    [sha256(token)],
  );
  if (!row) return null;
  // At most one write a minute per key, so busy clients don't turn every read into a write.
  q.run('UPDATE api_keys SET last_used_at = unixepoch() WHERE id = ? AND (last_used_at IS NULL OR last_used_at < unixepoch() - 60)', [
    row.key_id,
  ]);
  const { key_id: _, ...user } = row;
  return user;
}

/** Resolves the current user from a session cookie, or a `Authorization: Bearer` session token or API key. */
export const loadUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = readToken(c);
  const bearer = c.req.header('authorization')?.startsWith('Bearer ');
  let user: User | null = token && bearer && token.startsWith(API_KEY_PREFIX) ? userFromApiKey(token) : null;
  c.set('apiKey', Boolean(user));
  // A session token may start with the same characters by chance: fall back to sessions.
  if (token && !user) {
    user =
      q.get<User>(
        `SELECT u.id, u.email, u.pseudo, u.role FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > unixepoch()`,
        [sha256(token)],
      ) ?? null;
  }
  c.set('user', user);
  await next();
};

export function requireUser(c: Context<AuthEnv>): User {
  const user = c.get('user');
  if (!user) fail(401, 'Authentification requise');
  return user;
}

export function requireAdmin(c: Context<AuthEnv>): User {
  const user = requireUser(c);
  if (user.role !== 'admin') fail(403, 'Réservé aux administrateurs');
  return user;
}

/** Editors may only modify what they authored; admins may modify everything. */
export function assertCanEdit(user: User, authorId: number | null) {
  if (user.role !== 'admin' && authorId !== user.id) fail(403, "Vous n'êtes pas l'auteur de ce contenu");
}

export async function bootstrapAdmin() {
  const { email, password, pseudo } = config.bootstrapAdmin;
  const count = q.get<{ n: number }>('SELECT count(*) AS n FROM users')!.n;
  if (count > 0 || !email || !password) return;
  q.run("INSERT INTO users (email, pseudo, role, password_hash) VALUES (?, ?, 'admin', ?)", [
    email,
    pseudo,
    await hashPassword(password),
  ]);
  console.log(`[bouffe-center] admin account created for ${email}`);
}
