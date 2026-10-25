import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { type AuthEnv, requireAdmin } from '../lib/auth.ts';
import { grapemindsConfigured, grapemindsUsage, pingGrapeminds, setGrapemindsKey } from '../lib/grapeminds.ts';
import { fail } from '../lib/http.ts';

const status = () => ({ configured: grapemindsConfigured(), usage: grapemindsUsage() });

/** Admin-only integration keys. They are write-only: no route ever returns them. */
export const integrations = new Hono<AuthEnv>()
  .get('/grapeminds', (c) => {
    requireAdmin(c);
    return c.json(status());
  })

  /** Saving a key checks it first (one request on the quota). Sessions only: an API key can't change it. */
  .put('/grapeminds', validate('json', z.object({ api_key: z.string().trim().min(8).max(500) })), async (c) => {
    requireAdmin(c);
    if (c.get('apiKey')) fail(403, 'Action réservée à une session (pas de clé API)');
    const { api_key } = c.req.valid('json');
    await pingGrapeminds(api_key);
    setGrapemindsKey(api_key);
    return c.json(status());
  })

  .post('/grapeminds/test', async (c) => {
    requireAdmin(c);
    await pingGrapeminds();
    return c.json({ ok: true, ...status() });
  })

  .delete('/grapeminds', (c) => {
    requireAdmin(c);
    if (c.get('apiKey')) fail(403, 'Action réservée à une session (pas de clé API)');
    setGrapemindsKey(null);
    return c.json(status());
  });
