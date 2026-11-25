import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { type AuthEnv, requireAdmin } from '../lib/auth.ts';
import { grapemindsConfigured, grapemindsUsage, pingGrapeminds, setGrapemindsKey } from '../lib/grapeminds.ts';
import { fail } from '../lib/http.ts';
import { checkOllama, listOllamaModels, ollamaConfig, ollamaStatus, ollamaUrl, setOllamaConfig } from '../lib/ollama.ts';

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
  })

  // ---- Ollama (optional): drafts a recipe from a prompt. The token, if any, is never returned.
  .get('/ollama', (c) => {
    requireAdmin(c);
    return c.json(ollamaStatus());
  })

  /** Models served at an address, to pick one before saving (reuses the saved token for the saved address). */
  .post('/ollama/models', validate('json', z.object({ url: ollamaUrl, token: z.string().trim().max(500).optional() })), async (c) => {
    requireAdmin(c);
    const { url, token } = c.req.valid('json');
    const saved = ollamaConfig();
    const models = await listOllamaModels(url, token || (saved?.url === url ? saved.token : null));
    return c.json({ models });
  })

  /** Saving checks that the server answers and has the model. token: omitted keeps the saved one, empty removes it. */
  .put(
    '/ollama',
    validate('json', z.object({ url: ollamaUrl, model: z.string().trim().min(1).max(200), token: z.string().trim().max(500).optional() })),
    async (c) => {
      requireAdmin(c);
      if (c.get('apiKey')) fail(403, 'Action réservée à une session (pas de clé API)');
      const { url, model, token } = c.req.valid('json');
      const config = { url, model, token: token === undefined ? (ollamaConfig()?.token ?? null) : token || null };
      await checkOllama(config);
      setOllamaConfig(config);
      return c.json(ollamaStatus());
    },
  )

  .post('/ollama/test', async (c) => {
    requireAdmin(c);
    const config = ollamaConfig();
    if (!config) fail(404, 'Connexion Ollama non configurée');
    await checkOllama(config);
    return c.json({ ok: true, ...ollamaStatus() });
  })

  .delete('/ollama', (c) => {
    requireAdmin(c);
    if (c.get('apiKey')) fail(403, 'Action réservée à une session (pas de clé API)');
    setOllamaConfig(null);
    return c.json(ollamaStatus());
  });
