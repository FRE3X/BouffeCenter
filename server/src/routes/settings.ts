import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { type AuthEnv, requireAdmin } from '../lib/auth.ts';
import { grapemindsConfigured } from '../lib/grapeminds.ts';
import { ollamaConfigured } from '../lib/ollama.ts';
import { getSettings, setSettings } from '../lib/settings.ts';

const settingsInput = z
  .object({
    map_private: z.boolean(),
    recipes_private: z.boolean(),
    planning_private: z.boolean(),
    products_private: z.boolean(),
    cellar_private: z.boolean(),
    products_enabled: z.boolean(),
    cellar_enabled: z.boolean(),
  })
  .partial();

/** Public settings, plus whether optional integrations are available (never their keys). */
const publicSettings = () => ({ ...getSettings(), grapeminds_enabled: grapemindsConfigured(), ollama_enabled: ollamaConfigured() });

export const settings = new Hono<AuthEnv>()
  .get('/', (c) => c.json(publicSettings()))

  .patch('/', validate('json', settingsInput), (c) => {
    requireAdmin(c);
    setSettings(c.req.valid('json'));
    return c.json(publicSettings());
  });
