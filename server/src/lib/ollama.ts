import { z } from 'zod';
import { q } from '../db.ts';
import { fail } from './http.ts';
import { deleteSecret, getSecret, setSecret } from './secrets.ts';
import { cleanTags, normalize } from './text.ts';

/**
 * Optional Ollama server (https://ollama.com) used to draft a recipe from a prompt.
 * The draft only prefills the editor: nothing is saved until a member reviews it.
 * Settings live in the `secrets` table (never returned in full, never in a backup).
 */
const KEY = 'ollama';

export type OllamaConfig = { url: string; model: string; token: string | null };

export const ollamaUrl = z
  .string()
  .trim()
  .url('Adresse invalide')
  .refine((u) => /^https?:\/\//i.test(u), 'L\'adresse doit commencer par http:// ou https://')
  .transform((u) => u.replace(/\/+$/, ''));

export function ollamaConfig(): OllamaConfig | null {
  try {
    return JSON.parse(getSecret(KEY) ?? 'null') as OllamaConfig | null;
  } catch {
    return null;
  }
}

export const ollamaConfigured = () => ollamaConfig() !== null;

export function setOllamaConfig(config: OllamaConfig | null) {
  if (config) setSecret(KEY, JSON.stringify(config));
  else deleteSecret(KEY);
}

/** What an admin may see: the token stays on the server. */
export function ollamaStatus() {
  const config = ollamaConfig();
  return config ? { configured: true, url: config.url, model: config.model, has_token: Boolean(config.token) } : { configured: false };
}

async function call<T>(url: string, token: string | null, path: string, init: RequestInit & { timeout: number }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(init.timeout),
    });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') fail(504, 'Ollama met trop de temps à répondre, réessayez ou choisissez un modèle plus léger');
    fail(502, 'Ollama ne répond pas : vérifiez l\'adresse et que le serveur est joignable');
  }
  if (res.status === 401 || res.status === 403) fail(502, 'Ollama a refusé l\'accès : vérifiez le jeton');
  if (res.status === 404 && path === '/api/chat') fail(502, 'Modèle introuvable sur Ollama : choisissez-en un autre dans les paramètres');
  if (!res.ok) fail(502, `Ollama a répondu une erreur (${res.status})`);
  return (await res.json()) as T;
}

export type OllamaModel = { name: string; size: number; parameters: string | null };

export async function listOllamaModels(url: string, token: string | null): Promise<OllamaModel[]> {
  const data = await call<{ models?: { name: string; size?: number; details?: { parameter_size?: string } }[] }>(url, token, '/api/tags', {
    method: 'GET',
    timeout: 6000,
  });
  return (data.models ?? [])
    .map((m) => ({ name: m.name, size: m.size ?? 0, parameters: m.details?.parameter_size ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Checks that the server answers and serves this model. */
export async function checkOllama(config: OllamaConfig) {
  const models = await listOllamaModels(config.url, config.token);
  if (!models.some((m) => m.name === config.model)) fail(400, `Le modèle « ${config.model} » n'est pas installé sur ce serveur Ollama`);
}

const draftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).catch(''),
  ingredients: z
    .array(z.object({ qty: z.string().trim().max(60).catch(''), name: z.string().trim().min(1).max(200) }))
    .max(60)
    .catch([]),
  steps: z.array(z.string().trim().min(1).max(2000)).max(40).catch([]),
  tips: z.string().trim().max(1500).nullish().catch(null),
  tags: z.array(z.string().trim().max(40)).catch([]),
  category: z.string().trim().nullish().catch(null),
});

export type RecipeDraft = {
  title: string;
  description: string;
  ingredients: { qty: string; name: string }[];
  body: string;
  tags: string[];
  category_id: number | null;
};

// A small server rarely runs two generations well: one at a time.
let busy = false;

export async function generateRecipeDraft(prompt: string): Promise<RecipeDraft> {
  const config = ollamaConfig();
  if (!config) fail(404, 'Connexion Ollama non configurée');
  if (busy) fail(429, 'Une recette est déjà en cours de génération, réessayez dans un instant');

  // Reuse the site's own vocabulary so the draft fits in.
  const categories = q.all<{ id: number; name: string }>('SELECT id, name FROM categories ORDER BY sort, name');
  const knownTags = q
    .all<{ value: string }>(
      'SELECT value FROM recipes, json_each(recipes.tags) GROUP BY value ORDER BY count(*) DESC, value LIMIT 40',
    )
    .map((t) => t.value);

  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      ingredients: {
        type: 'array',
        items: { type: 'object', properties: { qty: { type: 'string' }, name: { type: 'string' } }, required: ['qty', 'name'] },
      },
      steps: { type: 'array', items: { type: 'string' } },
      tips: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      category: categories.length ? { type: 'string', enum: [...categories.map((c) => c.name), ''] } : { type: 'string' },
    },
    required: ['title', 'description', 'ingredients', 'steps', 'tags'],
  };

  const system = [
    'Tu es un chef cuisinier français qui rédige des recettes maison claires et fiables.',
    'Réponds uniquement avec un objet JSON conforme au schéma, entièrement en français.',
    'title : le nom du plat. description : une ou deux phrases qui donnent envie (sans répéter le titre).',
    'ingredients : quantités en unités métriques dans qty (« 200 g », « 2 », « 1 c. à soupe », vide si « selon le goût »), nom seul dans name.',
    'steps : les étapes dans l\'ordre, une action par étape, avec temps et températures quand c\'est utile. Pas de numéro au début.',
    'tips : une astuce facultative (chaîne vide sinon).',
    `tags : 2 à 5 mots-clés courts en minuscules sans « # »${knownTags.length ? `, de préférence parmi : ${knownTags.join(', ')}` : ''}.`,
    categories.length ? `category : la catégorie la plus proche parmi : ${categories.map((c) => c.name).join(', ')} (chaîne vide si aucune ne convient).` : '',
  ]
    .filter(Boolean)
    .join('\n');

  busy = true;
  let content: string;
  try {
    const data = await call<{ message?: { content?: string } }>(config.url, config.token, '/api/chat', {
      method: 'POST',
      timeout: 240_000,
      body: JSON.stringify({
        model: config.model,
        stream: false,
        format: schema,
        options: { temperature: 0.6 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    });
    content = data.message?.content ?? '';
  } finally {
    busy = false;
  }

  let parsed: z.infer<typeof draftSchema>;
  try {
    parsed = draftSchema.parse(JSON.parse(content));
  } catch {
    fail(502, 'La réponse d\'Ollama est inexploitable, réessayez ou reformulez la demande');
  }

  const wanted = parsed.category ? normalize(parsed.category) : '';
  const category = wanted ? categories.find((c) => normalize(c.name) === wanted) : undefined;
  const steps = parsed.steps.map((s, i) => `${i + 1}. ${s.replace(/^\s*\d+[.)]\s*/, '')}`).join('\n');
  const body = [steps, parsed.tips ? `> Astuce : ${parsed.tips}` : ''].filter(Boolean).join('\n\n');

  return {
    title: parsed.title,
    description: parsed.description,
    ingredients: parsed.ingredients,
    body,
    tags: cleanTags(parsed.tags.map((t) => t.replace(/^#/, ''))).slice(0, 8),
    category_id: category?.id ?? null,
  };
}
